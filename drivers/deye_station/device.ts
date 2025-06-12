'use strict';

import Homey from 'homey';
import DeyeApp from '../../app';
import { BATTERY_MODE_CONTROL, BATTERY_PARAMETER, DATA_CENTER, ENERGY_PATTERN, IDeyeDeviceLatestData, IDeyeDeviceLatestKeyValue, IDeyeStationLatestData, IDeyeStationWithDevice, IDeyeToken, ON_OFF, WORK_MODE } from '../../lib/deye_api';
import DeyeStationDriver from './driver';
import { ISolarmanLatestData } from '../../lib/solarman_api';

enum LatestDataSource {
  STATION = 'station',
  DEVICE = 'device',
  SOLARMAN = 'solarman'
}

interface ILatestData {
  type: LatestDataSource;
  lastUpdateTime: number;
  dataTokens: {
    measure_battery: number;
    measure_battery_power: number;
    measure_consumption_power: number;
    measure_grid_power: number;
    measure_solar_power: number;
  },
  dailyTokens?: {
    daily_production: number;
    daily_consumption: number;
    daily_sell: number;
    daily_buy: number;
  },
  grid_available?: boolean;
  solar_production: boolean;
  battery_charging: boolean;
  grid_feeding: boolean;
};

export default class DeyeStationDevice extends Homey.Device {
  deyeApi = (this.homey.app as DeyeApp).deyeAPI;
  solarmanApi = (this.homey.app as DeyeApp).solarmanAPI;

  apiError = 0;

  driver!: DeyeStationDriver;
  dataCenter!: DATA_CENTER;
  token!: IDeyeToken;
  station!: IDeyeStationWithDevice;
  latestDataSource!: LatestDataSource;
  normalPollInterval!: number;
  minimumPollInterval!: number;
  localIp!: string;
  localPort!: number;
  unitId!: number;
  solarmanSerial!: string;
  localPollInterval!: number;
  lastData!: ILatestData;
  polling?: NodeJS.Timeout;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyDevice has been initialized', this.getName());

    this.dataCenter = this.getSetting('dataCenter');
    this.token = this.getSetting('token');
    this.station = this.getSetting('station');
    this.latestDataSource = this.getSetting('latestDataSource');
    this.normalPollInterval = this.getSetting('normalPollInterval');
    this.minimumPollInterval = this.getSetting('minimumPollInterval');
    this.localIp = this.getSetting('localIp');
    this.localPort = this.getSetting('localPort');
    this.unitId = this.getSetting('unitId');
    this.solarmanSerial = this.getSetting('solarmanSerial');
    this.localPollInterval = this.getSetting('localPollInterval');

    await this.updateCapabilites();

    /*
    TODO
    Capability not added because we don't know the device state
    this.setCapabilityValue('solar_sell', true); // Get this state somehow?
    this.registerCapabilityListener('solar_sell', (e, o) => {
      console.log('button solar sell pressed',e, o)
    })  
    */


    const validateStringValues = (value: any): string => {
      return value.toString() === value ? value : 'Invalid value!';
    }

    this.setAvailableCapabilityValue('address', validateStringValues(this.station.locationAddress));
    this.setAvailableCapabilityValue('owner', validateStringValues(this.station.name));

    if(this.station.deviceTotal > 0 && this.station.deviceListItems.length){
      this.setAvailableCapabilityValue('inverter_sn', validateStringValues(this.station.deviceListItems[0].deviceSn));
    }else{
      this.setAvailableCapabilityValue('inverter_sn', 'No device found!');
    }

    this.pollLatest();
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('MyDevice has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({oldSettings, newSettings, changedKeys}: { oldSettings: { [key: string]: boolean | string | number | undefined | null }; newSettings: { [key: string]: boolean | string | number | undefined | null }; changedKeys: string[]; }): Promise<string | void> {
    this.log("MyDevice settings where changed");

    this.latestDataSource = newSettings.latestDataSource as LatestDataSource;

    this.normalPollInterval = newSettings.normalPollInterval as number;
    this.minimumPollInterval = newSettings.minimumPollInterval as number;

    this.localIp = newSettings.localIp as string;
    this.localPort = newSettings.localPort as number;
    this.unitId = newSettings.unitId as number;
    this.solarmanSerial = newSettings.solarmanSerial as string;
    this.localPollInterval = newSettings.localPollInterval as number;

    this.updateCapabilites();
    this.pollLatest();
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('MyDevice was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('MyDevice has been deleted');

    this.homey.clearTimeout(this.polling);
  }

  async updateCapabilites(){
    const deviceOnlyCapabilites = [
      'daily_production', 
      'daily_consumption',
      'daily_buy',
      'daily_sell',
      'grid_available'
    ];

    for (const cap of deviceOnlyCapabilites){
      if(this.latestDataSource === LatestDataSource.SOLARMAN || this.latestDataSource === LatestDataSource.DEVICE){
        if (!this.hasCapability(cap)) await this.addCapability(cap);
      }else{
        if (this.hasCapability(cap)) await this.removeCapability(cap);
      }
    }
  }

  async pollLatest() {
    this.homey.clearTimeout(this.polling);

    let latest: ILatestData;

    try {
      switch (this.latestDataSource) {
        case LatestDataSource.DEVICE:
          latest = this.getLatestDataFromDevice(await this.deyeApi.getDeviceLatest(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn));
          break;
        case LatestDataSource.STATION:
          latest = this.getLatestDataFromStation(await this.deyeApi.getStationLatest(this.dataCenter, this.token, this.station.id));
          break;
        case LatestDataSource.SOLARMAN:
          latest = this.getLatestDataFromSolarman(await this.solarmanApi.getLatest(this.localIp, this.localPort, this.unitId, this.solarmanSerial));
          break;
      }
      
      this.apiError = 0;
      this.setAvailable();
    } catch (err) {
      this.log('Get latest error: ', err);
      this.log('Latest Data source: ', this.latestDataSource);
      this.log('Data center: ', this.dataCenter);
      this.log('Debug access: ', this.token.accessToken);
      this.log('Debug station data: ', JSON.stringify(this.station));
  
      if (++this.apiError < 61) {
        const pollInterval = this.latestDataSource === LatestDataSource.SOLARMAN ? this.localPollInterval : this.normalPollInterval;
        const pollDelay = pollInterval * 1000 * this.apiError;
        this.polling = this.homey.setTimeout(this.pollLatest.bind(this), pollDelay);
      } else {
        this.log('Maximum number of API call attempts reached!');
      }
      
      this.setUnavailable('Maximum number of API call attempts reached! Please check your login credentials and network connection.');
      return;
    }

    if (!this.lastData || this.lastData.lastUpdateTime < latest.lastUpdateTime) {
      this.setAvailableCapabilityValue('grid_available', latest.grid_available);
      this.setAvailableCapabilityValue('solar_production', latest.solar_production);
      this.setAvailableCapabilityValue('battery_charging', latest.battery_charging);
      this.setAvailableCapabilityValue('grid_feeding', latest.grid_feeding);

      Object.entries(latest.dataTokens).forEach(capability => this.setAvailableCapabilityValue(capability[0], capability[1]));
      this.driver.measuredDataUpdated_card.trigger(this, latest.dataTokens, {}).catch(this.error);

      if (latest.type === LatestDataSource.SOLARMAN || latest.type === LatestDataSource.DEVICE) {
        Object.entries(latest.dailyTokens!).forEach(capability => this.setAvailableCapabilityValue(capability[0], capability[1]));
        this.driver.dailyDataUpdated_card.trigger(this, latest.dailyTokens, {}).catch(this.error);

        this.driver.stationDataUpdated_card.trigger(this, {
          ...latest.dataTokens, 
          ...latest.dailyTokens
        }, {}).catch(this.error); // deprecated @v1.2.2
      } else {
        this.driver.stationDataUpdated_card.trigger(this, {
          ...latest.dataTokens,
          daily_production: 0,
          daily_consumption: 0,
          daily_sell: 0,
          daily_buy: 0
        }, {}).catch(this.error); // deprecated @v1.2.2
      }

      this.lastData = latest;
    }

    let pollDelay:number;
    if(latest.type === LatestDataSource.SOLARMAN){
      pollDelay = this.localPollInterval * 1000;
    }else{
      const tillNext = (latest.lastUpdateTime + this.normalPollInterval) - Math.floor(Date.now() / 1000);
      pollDelay = (tillNext <= 0 ? this.minimumPollInterval : tillNext) * 1000;
    }
    
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
        measure_consumption_power: getDeviceLatestKeyValue(data, "TotalConsumptionPower").value,
        measure_grid_power: getDeviceLatestKeyValue(data, "TotalGridPower").value,
        measure_solar_power: getDeviceLatestKeyValue(data, "TotalSolarPower").value,
      },
      dailyTokens: {
        daily_production: getDeviceLatestKeyValue(data, "DailyActiveProduction").value,
        daily_consumption: getDeviceLatestKeyValue(data, "DailyConsumption").value,
        daily_sell: getDeviceLatestKeyValue(data, "DailyEnergySell").value,
        daily_buy: getDeviceLatestKeyValue(data, "DailyEnergyBuy").value
      }
    } as ILatestData;

    latest.grid_available = getDeviceLatestKeyValue(data, "GridFrequency").value > 0;
    latest.solar_production = latest.dataTokens.measure_solar_power > 0;
    latest.battery_charging = latest.dataTokens.measure_battery_power < 0 && latest.dataTokens.measure_battery < 99;
    latest.grid_feeding = latest.dataTokens.measure_grid_power < 0;

    return latest;
  }

  getLatestDataFromSolarman(data: ISolarmanLatestData): ILatestData {
    const latest = {
      type: LatestDataSource.SOLARMAN,
      lastUpdateTime: data.updateTime,
      dataTokens: {
        measure_battery: data.battery,
        measure_battery_power: data.battery_power,
        measure_consumption_power: data.consumption_power,
        measure_grid_power: data.grid_power,
        measure_solar_power: data.solar_power
      },
      dailyTokens: {
        daily_production: data.daily_production,
        daily_consumption: data.daily_consumption,
        daily_sell: data.daily_sell,
        daily_buy: data.daily_buy
      }
    } as ILatestData;

    latest.grid_available = true;
    latest.solar_production = latest.dataTokens.measure_solar_power > 0;
    latest.battery_charging = latest.dataTokens.measure_battery_power < 0 && latest.dataTokens.measure_battery < 99;
    latest.grid_feeding = latest.dataTokens.measure_grid_power < 0;

    return latest;
  }

  setAvailableCapabilityValue(capabilityId: string, value: any): Promise<void> {
    if(this.hasCapability(capabilityId)) {
      return this.setCapabilityValue(capabilityId, value);
    }
    return Promise.resolve();
  }

  // Solar Sell

  async setSolarSell(value: ON_OFF) {
    return this.deyeApi.setSolarSell(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, value);
  }

  // Work Mode

  async setWorkMode(value: WORK_MODE) {
    return this.deyeApi.setWorkMode(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, value);
  }

  // Energy Pattern

  async setEnergyPattern(value: ENERGY_PATTERN) {
    return this.deyeApi.setEnergyPattern(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, value);
  }

  // Peak Shaving

  async setGridPeakShaving(action: ON_OFF, power: number) {
    return this.deyeApi.setGridPeakShaving(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, action, power);
  }

  // Battery Mode Controls

  async setBatteryGridCharge(value: ON_OFF) {
    return this.deyeApi.setBatteryModeControl(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_MODE_CONTROL.GRID_CHARGE, value);
  }
  
  async setBatteryGenCharge(value: ON_OFF) {
    return this.deyeApi.setBatteryModeControl(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_MODE_CONTROL.GEN_CHARGE, value);
  }

  // Battery Paramters

  async setBatteryMaxDischargeCurrent(value: number) {
    return this.deyeApi.setBatteryParamater(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_PARAMETER.MAX_DISCHARGE_CURRENT, value);
  }

  async setBatteryMaxChargeCurrent(value: number) {
    return this.deyeApi.setBatteryParamater(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_PARAMETER.MAX_CHARGE_CURRENT, value);
  }

  async setBatteryLow(value: number) {
    return this.deyeApi.setBatteryParamater(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_PARAMETER.BATT_LOW, value);
  }

  async setBatteryGridChargeCurrent(value: number) {
    return this.deyeApi.setBatteryParamater(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn, BATTERY_PARAMETER.GRID_CHARGE_AMPERE, value);
  }
}

module.exports = DeyeStationDevice;
