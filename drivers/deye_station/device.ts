'use strict';

import Homey from 'homey';
import DeyeApp from '../../app';
import { IDeyeStationLatestData, IDeyeStationWithDevice, IDeyeToken } from '../../lib/deye_api';
import DeyeStationDriver from './driver';

const NORMAL_POLL_INTERVAL = 390;
const MINIMUM_POLL_INTERVAL = 30;

export default class DeyeStationDevice extends Homey.Device {
  api = (this.homey.app as DeyeApp).api;
  apiError = 0;

  driver!: DeyeStationDriver;
  token!: IDeyeToken;
  station!: IDeyeStationWithDevice;
  last!: IDeyeStationLatestData;
  polling?: NodeJS.Timeout;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('MyDevice has been initialized', this.getName());

    this.token = this.getSetting('token');
    this.station = this.getSetting('station');

    this.setCapabilityValue('address', this.station.locationAddress);
    this.setCapabilityValue('owner', this.station.name);

    if(this.station.deviceTotal > 0 && this.station.deviceListItems.length){
      this.setCapabilityValue('inverter_sn', this.station.deviceListItems[0].deviceSn);
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
      latest = await this.api.getStationLatest(this.token, this.station.id);

      this.apiError = 0
      this.setAvailable();
    } catch (err) {
      this.log('Get sattion latest:', err);

      if(++this.apiError < 10) {
        const pollDelay = MINIMUM_POLL_INTERVAL * 1000 * this.apiError;
        this.polling = this.homey.setTimeout(this.poll.bind(this), pollDelay);
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
        measure_battery: latest.batterySOC,
        measure_battery_power: latest.batteryPower,
        measure_consumption_power: latest.consumptionPower,
        measure_grid_power: latest.wirePower,
        measure_solar_power: latest.generationPower
      }

      this.setCapabilityValue('measure_battery', dataTokens.measure_battery);
      this.setCapabilityValue('measure_battery_power', dataTokens.measure_battery_power);
      this.setCapabilityValue('measure_consumption_power', dataTokens.measure_consumption_power);
      this.setCapabilityValue('measure_grid_power', dataTokens.measure_grid_power);
      this.setCapabilityValue('measure_solar_power', dataTokens.measure_solar_power);

      this.driver.triggerStationDataUpdated(this,dataTokens,{});

      this.last = latest;
    }

    const tillNext = (latest.lastUpdateTime + NORMAL_POLL_INTERVAL) - Math.floor(Date.now() / 1000);
    const pollDelay = (tillNext <= 0 ? MINIMUM_POLL_INTERVAL : tillNext) * 1000;
    this.polling = this.homey.setTimeout(this.poll.bind(this), pollDelay);
  }
}

module.exports = DeyeStationDevice;
