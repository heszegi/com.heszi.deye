'use strict';

import Homey from 'homey';
import { PairSession } from 'homey/lib/Driver';
import DeyeApp from '../../app';
import { DATA_CENTER, IDeyeToken } from '../../lib/deye_api';
import DeyeStationDevice from './device';

export default class DeyeStationDriver extends Homey.Driver {
  stationDataUpdated_card!: Homey.FlowCardTriggerDevice;

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('MyDriver has been initialized');

    this.registerCapabilityCondition('battery_charging');
    this.registerCapabilityCondition('grid_feeding');
    this.registerCapabilityCondition('solar_production');

    this.stationDataUpdated_card = this.homey.flow.getDeviceTriggerCard("station_data_updated");
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
        this.log('Pair login:', err);
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
        this.log('Pair list devices:', err);
        return []
      }
    });
  }

  public async onRepair(session: PairSession, device: DeyeStationDevice): Promise<void> {
    session.setHandler('login', async (data: {username: string, password: string}) => {
      const settings = device.getSettings();

      try{
        const token = await (this.homey.app as DeyeApp).api.login(settings.dataCenter, data.username, data.password);
        device.setSettings({...settings, token});
        device.onInit();
        return true;
      }catch(err){
        this.log('Repair login:', err);
        return false;
      }
    });

    return Promise.resolve()
  }

  registerCapabilityCondition(capability: string) {
    this.homey.flow.getConditionCard(capability).registerRunListener(async (args:any, state:any) => {
      return (args.device as DeyeStationDevice).getCapabilityValue(capability);
    });
  }

  triggerStationDataUpdated(device: Homey.FlowCardTriggerDevice.Device, tokens: any, state: any) {
    this.stationDataUpdated_card.trigger(device, tokens, state).catch(this.error);
  }
}

module.exports = DeyeStationDriver;
