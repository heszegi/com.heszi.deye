'use strict';

import Homey from 'homey';
import { PairSession } from 'homey/lib/Driver';
import DeyeApp from '../../app';
import { DATA_CENTER, IDeyeToken } from '../../lib/deye_api';
import DeyeStationInverter from './devices/deyeStationInverter';
import DeyeStationBattery from './devices/deyeStationBattery';
import DeyeStationSolarpanel from './devices/deyeStationSolarpanel';
import DeyeStationDevice from './device';

enum DeviceType {
  INVERTER = 'inverter',
  BATTERY = 'battery',
  SOLARPANEL = 'solarpanel',
}

export default class DeyeStationDriver extends Homey.Driver {
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

    this.registerCapabiltyAction('set_solar_sell', 'setSolarSell', 'onoff');
    this.registerCapabiltyAction('set_work_mode', 'setWorkMode', 'workMode');
    this.registerCapabiltyAction('set_energy_pattern', 'setEnergyPattern', 'energyPattern');
    this.registerCapabiltyAction('set_grid_peak_shaving', 'setGridPeakShaving', ['onoff', 'power']);
    this.registerCapabiltyAction('set_time_of_use_action', 'setTimeOfUseAction', ['days']);
    this.registerCapabiltyAction('set_time_use_settings', 'setTimeUseSettingItems', ['timeslot', 'onoff_grid', 'onoff_gen', 'power', 'soc']);

    this.registerCapabiltyAction('set_battery_grid_charge', 'setBatteryGridCharge', 'onoff');
    this.registerCapabiltyAction('set_battery_gen_charge', 'setBatteryGenCharge', 'onoff');
    this.registerCapabiltyAction('set_battery_max_discharge_current', 'setBatteryMaxDischargeCurrent', 'current');
    this.registerCapabiltyAction('set_battery_max_charge_current', 'setBatteryMaxChargeCurrent', 'current');
    this.registerCapabiltyAction('set_battery_low', 'setBatteryLow', 'percent');
    this.registerCapabiltyAction('set_battery_grid_charge_current', 'setBatteryGridChargeCurrent', 'current');
    
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

        return stations.map(station => [
          {
            name: this.homey.__('inverterName', {id: station.id}),
            data: { id: station.id }, // type is undefined for inverter because of backward compatibility
            settings: { dataCenter, token, station }
          }, 
          {
            name: this.homey.__('bateryName', {id: station.id}),
            data: { id: station.id, type: DeviceType.BATTERY },
            settings: { inverter: station.id }
          }, 
          {
            name: this.homey.__('solarpanelName', {id: station.id}),
            data: { id: station.id, type: DeviceType.SOLARPANEL },
            settings: { inverter: station.id }
          }
        ]).flat();
      }catch(err){
        this.log('Pair list devices error: ', err);
        return []
      }
    });
  }

  async onRepair(session: PairSession, device: DeyeStationDevice): Promise<void> {
    const inverter = this.getDeviceByType<DeyeStationInverter>(device.getData().id, DeviceType.INVERTER);

    session.setHandler('login', async (data: {username: string, password: string}) => {
      try {
        const settings = inverter.getSettings();
        const token = await (this.homey.app as DeyeApp).api.login(settings.dataCenter, data.username, data.password);
        inverter.setSettings({
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
        const settings = inverter.getSettings();
        const stations = await (this.homey.app as DeyeApp).api.getStationsWithDevice(settings.dataCenter, settings.token);
        const station = stations.filter( station => station.id === settings.station.id)[0];

        if(station){
          inverter.setSettings({
            settings,
            station
          });
          inverter.onInit();
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

  onMapDeviceClass( device: DeyeStationDevice ) {
    switch (device.getData().type) {
      case DeviceType.BATTERY:
        return DeyeStationBattery;
      case DeviceType.SOLARPANEL:
        return DeyeStationSolarpanel;
      default:
        return DeyeStationInverter;
    }
  }

  getDeviceByType<T = DeyeStationDevice>(inverterId: string, type: DeviceType): T {
    type = (type === DeviceType.INVERTER ? undefined : type) as DeviceType;
    const device = this.getDevices()
      .filter( d => d.getData().id === inverterId && d.getData().type === type)[0];

    return device as T;
  }

  updateChildDevices(device: DeyeStationInverter) {
    this.getDeviceByType<DeyeStationBattery>(device.getData().id, DeviceType.BATTERY)?.setCapabilitiyValues(device);
    this.getDeviceByType<DeyeStationSolarpanel>(device.getData().id, DeviceType.SOLARPANEL)?.setCapabilitiyValues(device);
  }

  disableChildDevices(device: DeyeStationInverter) {
    this.getDeviceByType<DeyeStationBattery>(device.getData().id, DeviceType.BATTERY)?.setUnavailable(this.homey.__('device.inverter_removed'));
    this.getDeviceByType<DeyeStationSolarpanel>(device.getData().id, DeviceType.SOLARPANEL)?.setUnavailable(this.homey.__('device.inverter_removed'));
  }

  registerCapabilityCondition(capability: string) {
    this.homey.flow.getConditionCard(capability).registerRunListener(async (args: any, state: any) => {
      return (args.device as DeyeStationInverter).getCapabilityValue(capability);
    });
  }

  registerCapabiltyAction(capability: string, listener: string, valueName: string | string[]) {
    this.homey.flow.getActionCard(capability).registerRunListener(async (args: any, state: any) => {
      const values = [];
      if(Array.isArray(valueName)) valueName.forEach(v => values.push(args[v]));
      else values.push(args[valueName]);
      await (args.device[listener] as Function).apply(args.device, values).catch(this.error);
    })
  }
}

module.exports = DeyeStationDriver;
