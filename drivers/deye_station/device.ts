'use strict';

import Homey from 'homey';
import DeyeApp from '../../app';
import { BATTERY_MODE_CONTROL, BATTERY_PARAMETER, DATA_CENTER, ENERGY_PATTERN, IDeyeDeviceLatestData, IDeyeDeviceLatestKeyValue, IDeyeStationLatestData, IDeyeStationWithDevice, IDeyeToken, ON_OFF, WORK_MODE } from '../../lib/deye_api';
import DeyeStationDriver from './driver';

export default class DeyeStationDevice extends Homey.Device {
  api = (this.homey.app as DeyeApp).api;
  apiError = 0;

  driver!: DeyeStationDriver;
  dataCenter!: DATA_CENTER;
  token!: IDeyeToken;
  station!: IDeyeStationWithDevice;
  normalPollInterval!: number;
  minimumPollInterval!: number;
  lastStationData!: IDeyeStationLatestData;
  lastDeviceData!: IDeyeDeviceLatestData;
  polling?: NodeJS.Timeout;

  validateNumberValues = (value: any): number => {
    return isNaN(value) ? NaN : value;
  }

  validateStringValues = (value: any): string => {
    return value.toString() === value ? value : 'Invalid value!';
  }

  getLatestKeyValue = (data:IDeyeDeviceLatestData, key: string): IDeyeDeviceLatestKeyValue<number> => {
    const keyValue = data.dataList.find(item => item.key === key) || {key: key, value: '', unit: ''};
    return {...keyValue, value: parseFloat(keyValue.value)};
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyDevice has been initialized', this.getName());

    this.dataCenter = this.getSetting('dataCenter');
    this.token = this.getSetting('token');
    this.station = this.getSetting('station');
    this.normalPollInterval = this.getSetting('normalPollInterval');
    this.minimumPollInterval = this.getSetting('minimumPollInterval');

    await this.migrateCapabilities();

    /*
    TODO
    Capability not added because we don't know the device state
    this.setCapabilityValue('solar_sell', true); // Get this state somehow?
    this.registerCapabilityListener('solar_sell', (e, o) => {
      console.log('button solar sell pressed',e, o)
    })  
    */

    this.setCapabilityValue('address', this.validateStringValues(this.station.locationAddress));
    this.setCapabilityValue('owner', this.validateStringValues(this.station.name));

    if(this.station.deviceTotal > 0 && this.station.deviceListItems.length){
      this.setCapabilityValue('inverter_sn', this.validateStringValues(this.station.deviceListItems[0].deviceSn));
    }else{
      this.setCapabilityValue('inverter_sn', 'No device found!');
    }

    //this.pollStationLatest();
    this.pollDeviceLatest();
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
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    this.log("MyDevice settings where changed");
    this.normalPollInterval = newSettings.normalPollInterval as number;
    this.minimumPollInterval = newSettings.minimumPollInterval as number;
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

  async migrateCapabilities() {
    const remove: string[] = [];
    for (const cap of remove) if (this.hasCapability(cap)) await this.removeCapability(cap);

    const add = [
      'inverter_sn'
    ];
    for (const cap of add) if (!this.hasCapability(cap)) await this.addCapability(cap);
  }

  // old data source, changed to pollDeviceLatest
  async pollStationLatest() {
    this.homey.clearTimeout(this.polling);
    
    let latest: IDeyeStationLatestData;

    try {
      latest = await this.api.getStationLatest(this.dataCenter, this.token, this.station.id);

      this.apiError = 0
      this.setAvailable();
    } catch (err) {
      this.log('Get sattion latest:', err);

      if(++this.apiError < 61) {
        const pollDelay = this.minimumPollInterval * 1000 * this.apiError;
        this.polling = this.homey.setTimeout(this.pollStationLatest.bind(this), pollDelay);
      } else {
        this.log('Reached max number of API call tries!');
      }
      
      this.setUnavailable();
      return;
    }

    if(!this.lastStationData || this.lastStationData.lastUpdateTime < latest.lastUpdateTime){
      const solar_production = latest.generationPower > 0;
      this.setCapabilityValue('solar_production', solar_production);

      const battery_charging = latest.chargePower < 0 && latest.batterySOC < 99;
      this.setCapabilityValue('battery_charging', battery_charging);

      const grid_feeding = latest.wirePower < 0;
      this.setCapabilityValue('grid_feeding', grid_feeding);

      const dataTokens = {
        measure_battery: this.validateNumberValues(latest.batterySOC),
        measure_battery_power: this.validateNumberValues(latest.batteryPower),
        measure_consumption_power: this.validateNumberValues(latest.consumptionPower),
        measure_grid_power: this.validateNumberValues(latest.wirePower),
        measure_solar_power: this.validateNumberValues(latest.generationPower)
      }

      this.setCapabilityValue('measure_battery', dataTokens.measure_battery);
      this.setCapabilityValue('measure_battery_power', dataTokens.measure_battery_power);
      this.setCapabilityValue('measure_consumption_power', dataTokens.measure_consumption_power);
      this.setCapabilityValue('measure_grid_power', dataTokens.measure_grid_power);
      this.setCapabilityValue('measure_solar_power', dataTokens.measure_solar_power);

      this.driver.triggerStationDataUpdated(this,dataTokens,{});

      this.lastStationData = latest;
    }

    const tillNext = (latest.lastUpdateTime + this.normalPollInterval) - Math.floor(Date.now() / 1000);
    const pollDelay = (tillNext <= 0 ? this.minimumPollInterval : tillNext) * 1000;
    this.polling = this.homey.setTimeout(this.pollStationLatest.bind(this), pollDelay);
  }

  async pollDeviceLatest() {
    this.homey.clearTimeout(this.polling);
    
    let latest: IDeyeDeviceLatestData;
  
    try {
      latest = await this.api.getDeviceLatest(this.dataCenter, this.token, this.station.deviceListItems[0].deviceSn);
      
      this.apiError = 0;
      this.setAvailable();
    } catch (err) {
      this.log('Get device latest:', err);
  
      if (++this.apiError < 61) {
        const pollDelay = this.minimumPollInterval * 1000 * this.apiError;
        this.polling = this.homey.setTimeout(this.pollDeviceLatest.bind(this), pollDelay);
      } else {
        this.log('Reached max number of API call tries!');
      }
      
      this.setUnavailable();
      return;
    }
  
    const lastUpdateTime = latest.collectionTime;
    if (!this.lastDeviceData || this.lastDeviceData.collectionTime < lastUpdateTime) {
  
      const dataTokens = {
        measure_battery: this.getLatestKeyValue(latest, "SOC").value,
        measure_battery_power: this.getLatestKeyValue(latest, "BatteryPower").value,
        measure_consumption_power: this.getLatestKeyValue(latest, "TotalConsumptionPower").value,
        measure_grid_power: this.getLatestKeyValue(latest, "TotalGridPower").value,
        measure_solar_power: this.getLatestKeyValue(latest, "TotalSolarPower").value
      }
      
      const solar_production = dataTokens.measure_solar_power > 0;
      this.setCapabilityValue('solar_production', solar_production);
  
      const battery_charging = dataTokens.measure_battery_power < 0 && dataTokens.measure_battery < 99;
      this.setCapabilityValue('battery_charging', battery_charging);
  
      const grid_feeding = dataTokens.measure_grid_power < 0;
      this.setCapabilityValue('grid_feeding', grid_feeding);
  
      this.setCapabilityValue('measure_battery', dataTokens.measure_battery);
      this.setCapabilityValue('measure_battery_power', dataTokens.measure_battery_power);
      this.setCapabilityValue('measure_consumption_power', dataTokens.measure_consumption_power);
      this.setCapabilityValue('measure_grid_power', dataTokens.measure_grid_power);
      this.setCapabilityValue('measure_solar_power', dataTokens.measure_solar_power);
  
      this.driver.triggerStationDataUpdated(this, dataTokens, {});
  
      this.lastDeviceData = latest;
    }
  
    const tillNext = (lastUpdateTime + this.normalPollInterval) - Math.floor(Date.now() / 1000);
    const pollDelay = (tillNext <= 0 ? this.minimumPollInterval : tillNext) * 1000;
    this.polling = this.homey.setTimeout(this.pollDeviceLatest.bind(this), pollDelay);
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

module.exports = DeyeStationDevice;
