import DeyeApp from '../../../app';
import { BATTERY_MODE_CONTROL, BATTERY_PARAMETER, DATA_CENTER, DAYS_OF_WEEK, ENERGY_PATTERN, IDeyeDeviceLatestData, IDeyeDeviceLatestKeyValue, IDeyeStationLatestData, IDeyeStationWithDevice, IDeyeToken, ON_OFF, WORK_MODE } from '../../../lib/deye_api';
import DeyeStationDevice, { ICapabilityList } from '../device';
import { IKeyValue } from '../driver';

export enum LatestDataSource {
  STATION = 'station',
  DEVICE = 'device'
}

export interface ILatestData {
  type: LatestDataSource;
  lastUpdateTime: number;
  dataTokens: {
    measure_battery: number;
    measure_battery_power: number;
    measure_battery_temperature: number;
    measure_consumption_power: number;
    measure_grid_power: number;
    measure_solar_power: number;
    rawJSON: string;
  },
  dailyTokens?: {
    daily_production: number;
    daily_consumption: number;
    daily_sell: number;
    daily_buy: number;
    daily_charge: number;
    daily_discharge: number;
  },
  grid_available?: boolean;
  solar_production: boolean;
  battery_charging: boolean;
  grid_feeding: boolean;
};

export default class DeyeStationInverter extends DeyeStationDevice {
  api = (this.homey.app as DeyeApp).api;
  apiError = 0;

  dataCenter!: DATA_CENTER;
  token!: IDeyeToken;
  station!: IDeyeStationWithDevice;
  normalPollInterval!: number;
  minimumPollInterval!: number;
  latestDataSource!: LatestDataSource;
  lastData!: ILatestData;
  polling?: NodeJS.Timeout;

  override async onInit() {
    super.onInit();

    this.dataCenter = this.getSetting('dataCenter');
    this.token = this.getSetting('token');
    this.station = this.getSetting('station');
    this.normalPollInterval = this.getSetting('normalPollInterval');
    this.minimumPollInterval = this.getSetting('minimumPollInterval');
    this.latestDataSource = this.getSetting('latestDataSource');

    await this.setupCapabilites(
      [],
      [
        { id: 'grid_feeding' },
        { id: 'solar_production'},
        { id: 'battery_charging' },
        { id: 'measure_battery' },
        { id: 'measure_battery_power' },
        { id: 'measure_battery_temperature' },
        { id: 'measure_solar_power' },
        { id: 'measure_consumption_power' },
        { id: 'measure_grid_power' },
        { id: 'owner' },
        { id: 'address' },
      ]
    );
    await this.updateCapabilites();

    const validateStringValues = (value: any): string => {
      return value.toString() === value ? value : this.homey.__('device.inverter.unknown_value');
    }

    this.setAvailableCapabilityValue('address', validateStringValues(this.station.locationAddress));
    this.setAvailableCapabilityValue('owner', validateStringValues(this.station.name));

    if(this.station.deviceTotal > 0 && this.station.deviceListItems.length){
      this.setAvailableCapabilityValue('inverter_sn', validateStringValues(this.station.deviceListItems[0].deviceSn));
    }else{
      this.setAvailableCapabilityValue('inverter_sn', this.homey.__('device.inverter.no_device_sn'));
    }

    this.pollLatest();
  }

  override async onSettings({oldSettings, newSettings, changedKeys}: { oldSettings: IKeyValue; newSettings: IKeyValue; changedKeys: IKeyValue; }): Promise<string | void> {
    super.onSettings({oldSettings, newSettings, changedKeys});

    this.normalPollInterval = newSettings.normalPollInterval as number;
    this.minimumPollInterval = newSettings.minimumPollInterval as number;
    this.latestDataSource = newSettings.latestDataSource as LatestDataSource;
    
    this.updateCapabilites();
    this.pollLatest();
  }

  override async onDeleted() {
    this.homey.clearTimeout(this.polling);
    this.driver.disableChildDevices(this);
  }

  async updateCapabilites(){
    const deviceOnlyCapabilites: ICapabilityList[] = [
      { id: 'daily_production' }, 
      { id: 'daily_consumption' },
      { id: 'daily_buy' },
      { id: 'daily_sell' },
      { id: 'grid_available' }
    ];

    if(this.latestDataSource === LatestDataSource.DEVICE){
      await this.setupCapabilites([], deviceOnlyCapabilites);
    }else{
      await this.setupCapabilites(deviceOnlyCapabilites, []);
    }
  }

  async pollLatest() {
    this.homey.clearTimeout(this.polling);

    let latest: ILatestData;

    try {
      latest = this.latestDataSource === LatestDataSource.DEVICE ? 
        this.getLatestDataFromDevice(await this.api.getDeviceLatest(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn)) :
        this.getLatestDataFromStation(await this.api.getStationLatest(this.dataCenter, this.token, this.station.id));
      
      this.apiError = 0;
      this.setAvailable();
    } catch (err) {
      this.log('Get latest error: ', err);
      this.log('Data center: ', this.dataCenter);
      this.log('Latest Data source: ', this.latestDataSource);
      this.log('Debug access: ', this.token.accessToken);
      this.log('Debug station data: ', JSON.stringify(this.station));
  
      if (++this.apiError < 61) {
        const pollDelay = this.minimumPollInterval * 1000 * this.apiError;
        this.polling = this.homey.setTimeout(this.pollLatest.bind(this), pollDelay);
      } else {
        this.log('Reached max number of API call tries!');
      }
      
      this.setUnavailable(this.homey.__('device.inverter.max_retries_reached'));
      return;
    }

    if (!this.lastData || this.lastData.lastUpdateTime < latest.lastUpdateTime) {
      this.setAvailableCapabilityValue('grid_available', latest.grid_available);
      this.setAvailableCapabilityValue('solar_production', latest.solar_production);
      this.setAvailableCapabilityValue('battery_charging', latest.battery_charging);
      this.setAvailableCapabilityValue('grid_feeding', latest.grid_feeding);

      Object.entries(latest.dataTokens).forEach(capability => this.setAvailableCapabilityValue(capability[0], capability[1]));
      this.driver.measuredDataUpdated_card.trigger(this, latest.dataTokens, {}).catch(this.error);

      if (latest.type === LatestDataSource.DEVICE && latest.dailyTokens) {
        Object.entries(latest.dailyTokens).forEach(capability => this.setAvailableCapabilityValue(capability[0], capability[1]));
        this.driver.dailyDataUpdated_card.trigger(this, latest.dailyTokens, {}).catch(this.error);
      }

      this.lastData = latest;

      this.driver.updateChildDevices(this);
    }
  
    const tillNext = (latest.lastUpdateTime + this.normalPollInterval) - Math.floor(Date.now() / 1000);
    const pollDelay = (tillNext <= 0 ? this.minimumPollInterval : tillNext) * 1000;
    this.polling = this.homey.setTimeout(this.pollLatest.bind(this), pollDelay);
  }

  getLatestDataFromStation(data: IDeyeStationLatestData): ILatestData {
    const validateNumberValues = (value: any): number => {
      return isNaN(value) ? NaN : value;
    }

    const latest: ILatestData = {
      type: LatestDataSource.STATION,
      lastUpdateTime: data.lastUpdateTime,
      dataTokens: {
        measure_battery: validateNumberValues(data.batterySOC),
        measure_battery_power: validateNumberValues(data.batteryPower),
        measure_consumption_power: validateNumberValues(data.consumptionPower),
        measure_grid_power: validateNumberValues(data.wirePower),
        measure_solar_power: validateNumberValues(data.generationPower)
      }
    } as ILatestData;

    latest.solar_production = latest.dataTokens.measure_solar_power > 0;
    latest.battery_charging = data.chargePower < 0 && latest.dataTokens.measure_battery < 99;
    latest.grid_feeding = latest.dataTokens.measure_grid_power < 0;

    return latest;
  }

  getLatestDataFromDevice(data: IDeyeDeviceLatestData): ILatestData {
    const getDeviceLatestKeyValue = (data:IDeyeDeviceLatestData, key: string): IDeyeDeviceLatestKeyValue<number> => {
      const keyValue = data.dataList.find(item => item.key === key) || {key: key, value: '', unit: ''};
      return {...keyValue, value: parseFloat(keyValue.value)};
    }

    const latest = {
      type: LatestDataSource.DEVICE,
      lastUpdateTime: data.collectionTime,
      dataTokens: {
        measure_battery: getDeviceLatestKeyValue(data, "SOC").value,
        measure_battery_power: getDeviceLatestKeyValue(data, "BatteryPower").value,
        measure_battery_temperature: getDeviceLatestKeyValue(data, "Temperature- Battery").value,
        measure_consumption_power: getDeviceLatestKeyValue(data, "TotalConsumptionPower").value,
        measure_grid_power: getDeviceLatestKeyValue(data, "TotalGridPower").value,
        measure_solar_power: getDeviceLatestKeyValue(data, "TotalSolarPower").value,
        rawJSON: JSON.stringify(data)
      },
      dailyTokens: {
        daily_production: getDeviceLatestKeyValue(data, "DailyActiveProduction").value,
        daily_consumption: getDeviceLatestKeyValue(data, "DailyConsumption").value,
        daily_sell: getDeviceLatestKeyValue(data, "DailyEnergySell").value,
        daily_buy: getDeviceLatestKeyValue(data, "DailyEnergyBuy").value,
        daily_charge: getDeviceLatestKeyValue(data, "DailyChargingEnergy").value,
        daily_discharge: getDeviceLatestKeyValue(data, "DailyDischargingEnergy").value
      }
    } as ILatestData;

    latest.grid_available = getDeviceLatestKeyValue(data, "GridFrequency").value > 0;
    latest.solar_production = latest.dataTokens.measure_solar_power > 0;
    latest.battery_charging = latest.dataTokens.measure_battery_power < 0 && latest.dataTokens.measure_battery < 99;
    latest.grid_feeding = latest.dataTokens.measure_grid_power < 0;

    return latest;
  }

  // Solar Sell

  async setSolarSell(value: ON_OFF) {
    return this.api.setSolarSell(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, value);
  }

  // Work Mode

  async setWorkMode(value: WORK_MODE) {
    return this.api.setWorkMode(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, value);
  }

  // Energy Pattern

  async setEnergyPattern(value: ENERGY_PATTERN) {
    return this.api.setEnergyPattern(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, value);
  }

  // Peak Shaving

  async setGridPeakShaving(action: ON_OFF, power: number) {
    return this.api.setGridPeakShaving(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, action, power);
  }

  // Time Of Use

  async setTimeOfUseAction(days: (DAYS_OF_WEEK | 'NEVER')[]) {
    let action = ON_OFF.ON;
    if(days.includes('NEVER')){
      action = ON_OFF.OFF;
      days = days.filter(d => d !== 'NEVER');
    }
    return this.api.setTimeOufUseAction(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, action, days as DAYS_OF_WEEK[]);
  }
  
  async setTimeUseSettingItems(timeslot: string[], onoff_grid: ON_OFF, onoff_gen: ON_OFF, power: number, soc: number) {
    const current = await this.api.getTimeOfUse(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn);

    timeslot.forEach(t => {
      current.timeUseSettingItems[parseInt(t)] = {
        ...current.timeUseSettingItems[parseInt(t)],
        enableGridCharge: onoff_grid === ON_OFF.ON,
        enableGeneration: onoff_gen === ON_OFF.ON,
        power,
        soc
      };
    });
    current.timeUseSettingItems.forEach(item => item.time = item.time.slice(0, 2) + ':' + item.time.slice(2, 4)); // API wants HH:MM format

    const ret = await this.api.setTimeUseSettingItems(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, current.timeUseSettingItems);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds to let the inverter process the new settings
    return ret;
  }

  // Battery Mode Controls

  async setBatteryGridCharge(value: ON_OFF) {
    return this.api.setBatteryModeControl(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_MODE_CONTROL.GRID_CHARGE, value);
  }
  
  async setBatteryGenCharge(value: ON_OFF) {
    return this.api.setBatteryModeControl(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_MODE_CONTROL.GEN_CHARGE, value);
  }

  // Battery Paramters

  async setBatteryMaxDischargeCurrent(value: number) {
    return this.api.setBatteryParamater(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_PARAMETER.MAX_DISCHARGE_CURRENT, value);
  }

  async setBatteryMaxChargeCurrent(value: number) {
    return this.api.setBatteryParamater(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_PARAMETER.MAX_CHARGE_CURRENT, value);
  }

  async setBatteryLow(value: number) {
    return this.api.setBatteryParamater(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_PARAMETER.BATT_LOW, value);
  }

  async setBatteryGridChargeCurrent(value: number) {
    return this.api.setBatteryParamater(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_PARAMETER.GRID_CHARGE_AMPERE, value);
  }
}
