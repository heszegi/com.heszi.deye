'use strict';

import Homey from 'homey';
import DeyeApp from '../../app';
import { DATA_CENTER, IDeyeStationLatestData, IDeyeStationWithDevice, IDeyeToken } from '../../lib/deye_api';
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
  last!: IDeyeStationLatestData;
  polling?: NodeJS.Timeout;

  validateNumberValues = (value: any): number => {
    return isNaN(value) ? NaN : value;
  }

  validateStringValues = (value: any): string => {
    return value.toString() === value ? value : 'Invalid value!';
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

    this.setCapabilityValue('address', this.validateStringValues(this.station.locationAddress));
    this.setCapabilityValue('owner', this.validateStringValues(this.station.name));

    if(this.station.deviceTotal > 0 && this.station.deviceListItems.length){
      this.setCapabilityValue('inverter_sn', this.validateStringValues(this.station.deviceListItems[0].deviceSn));
    }else{
      this.setCapabilityValue('inverter_sn', 'No device found!');
    }

    this.poll();
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

  async poll() {
    this.homey.clearTimeout(this.polling);
    
    let latest: IDeyeStationLatestData;

    try {
      latest = await this.api.getStationLatest(this.dataCenter, this.token, this.station.id);

      this.apiError = 0
      this.setAvailable();
    } catch (err) {
      this.log('Get sattion latest:', err);

      if(++this.apiError < 10) {
        const pollDelay = this.minimumPollInterval * 1000 * this.apiError;
        this.polling = this.homey.setTimeout(this.poll.bind(this), pollDelay);
      } else {
        this.log('Reached max number of API call tries!');
      }
      
      this.setUnavailable();
      return;
    }

    if(!this.last || this.last.lastUpdateTime < latest.lastUpdateTime){
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

      this.last = latest;
    }

    const tillNext = (latest.lastUpdateTime + this.normalPollInterval) - Math.floor(Date.now() / 1000);
    const pollDelay = (tillNext <= 0 ? this.minimumPollInterval : tillNext) * 1000;
    this.polling = this.homey.setTimeout(this.poll.bind(this), pollDelay);
  }
}

module.exports = DeyeStationDevice;
