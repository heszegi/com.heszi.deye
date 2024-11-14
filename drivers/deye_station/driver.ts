'use strict';

import Homey from 'homey';
import { PairSession } from 'homey/lib/Driver';
import DeyeApp from '../../app';
import { DATA_CENTER, ENERGY_PATTERN, IDeyeToken, ON_OFF, WORK_MODE } from '../../lib/deye_api';
import DeyeStationDevice from './device';

export default class DeyeStationDriver extends Homey.Driver {
  stationDataUpdated_card!: Homey.FlowCardTriggerDevice; // deprecated @v1.2.2
  measuredDataUpdated_card!: Homey.FlowCardTriggerDevice;
  dailyDataUpdated_card!: Homey.FlowCardTriggerDevice;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('MyDriver has been initialized');

    this.registerCapabilityCondition('grid_available');
    this.registerCapabilityCondition('battery_charging');
    this.registerCapabilityCondition('grid_feeding');
    this.registerCapabilityCondition('solar_production');

    this.registerCapabiltyAction<ON_OFF>('set_solar_sell', 'setSolarSell', 'onoff');
    this.registerCapabiltyAction<WORK_MODE>('set_work_mode', 'setWorkMode', 'workMode');
    this.registerCapabiltyAction<ENERGY_PATTERN>('set_energy_pattern', 'setEnergyPattern', 'energyPattern');

    this.registerCapabiltyAction<ON_OFF>('set_battery_grid_charge', 'setBatteryGridCharge', 'onoff');
    this.registerCapabiltyAction<ON_OFF>('set_battery_gen_charge', 'setBatteryGenCharge', 'onoff');
    this.registerCapabiltyAction<number>('set_battery_max_discharge_current', 'setBatteryMaxDischargeCurrent', 'current');
    this.registerCapabiltyAction<number>('set_battery_max_charge_current', 'setBatteryMaxChargeCurrent', 'current');
    this.registerCapabiltyAction<number>('set_battery_low', 'setBatteryLow', 'percent');
    this.registerCapabiltyAction<number>('set_battery_grid_charge_current', 'setBatteryGridChargeCurrent', 'current');

    this.stationDataUpdated_card = this.homey.flow.getDeviceTriggerCard('station_data_updated'); // deprecated @v1.2.2
    
    this.measuredDataUpdated_card = this.homey.flow.getDeviceTriggerCard('measured_data_updated');
    this.dailyDataUpdated_card = this.homey.flow.getDeviceTriggerCard('daily_data_updated');
  }

  async onPair(session: PairSession) {
    let dataCenter!: DATA_CENTER;
    let token!: IDeyeToken;

    session.setHandler('datacenter', async (dc: DATA_CENTER) => {
      dataCenter = dc;
      session.nextView();
    });

    session.setHandler('login', async (data: {username: string, password: string}) => {
      try{
        token = await (this.homey.app as DeyeApp).api.login(dataCenter, data.username, data.password);
        return true;
      }catch(err){
        this.log('Pair login error: ', err);
        return false;
      }
    });

    session.setHandler('list_devices', async () => {
      try{
        const stations = await (this.homey.app as DeyeApp).api.getStationsWithDevice(dataCenter, token);

        return stations.map((station) => {
          return {
            name: this.homey.__('stationName', {id: station.id}),
            data: {
              id: station.id,
            },
            settings: {
              dataCenter,
              token,
              station
            },
          };
        });
      }catch(err){
        this.log('Pair list devices error: ', err);
        return []
      }
    });
  }

  public async onRepair(session: PairSession, device: DeyeStationDevice): Promise<void> {

    session.setHandler('login', async (data: {username: string, password: string}) => {
      try {
        const settings = device.getSettings();
        const token = await (this.homey.app as DeyeApp).api.login(settings.dataCenter, data.username, data.password);
        device.setSettings({
          ...settings,
          token
        });
        return true;
      }catch(err){
        this.log('Repair login error: ', err);
        return false;
      }
    });

    session.setHandler('update', async () => {
      try {
        const settings = device.getSettings();
        const stations = await (this.homey.app as DeyeApp).api.getStationsWithDevice(settings.dataCenter, settings.token);
        const station = stations.filter( station => station.id === settings.station.id)[0];

        if(station){
          device.setSettings({
            settings,
            station
          });
          device.onInit();
          return 'updated';
        } else {
          this.log('Repair update station error: ', 'not_found');
          return 'not_found';
        }
      }catch(err){
        this.log('Repair update station error: ', err);
        return 'error';
      }
    });

    return Promise.resolve()
  }

  registerCapabilityCondition(capability: string) {
    this.homey.flow.getConditionCard(capability).registerRunListener(async (args: any, state: any) => {
      return (args.device as DeyeStationDevice).getCapabilityValue(capability);
    });
  }

  registerCapabiltyAction<T>(capability: string, listener: string, value: string) {
    this.homey.flow.getActionCard(capability).registerRunListener(async (args: any, state: any) => {
      args.device[listener](args[value]).catch(this.error);
    })
  }
}

module.exports = DeyeStationDriver;
