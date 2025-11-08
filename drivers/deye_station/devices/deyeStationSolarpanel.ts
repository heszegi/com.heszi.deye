import DeyeStationInverter, { LatestDataSource } from './deyeStationInverter';
import DeyeStationDevice, { ICapabilityList } from '../device';

export default class DeyeStationSolarpanel extends DeyeStationDevice {

  override async onInit() {
    this.log('DeyeStationSolarpanel has been initialized');

    await this.setClass('solarpanel');
    await this.setupCapabilites(
      [],
      [
        {id: 'solar_production'},
        {id: 'measure_power', title: this.homey.__('device.solarpanel.measure_power')},
        {id: 'meter_power', title: this.homey.__('device.solarpanel.meter_power')}
      ]
    );
    await this.setEnergy({
      'meterPowerExportedCapability': 'meter_power'
    });
  }
  
  override setCapabilitiyValues(parent: DeyeStationInverter) {
    super.setCapabilitiyValues(parent);

    this.setAvailableCapabilityValue('solar_production', parent.lastData.solar_production);
    this.setAvailableCapabilityValue('measure_power', parent.lastData.dataTokens.measure_solar_power);
    
    if (parent.lastData.type === LatestDataSource.DEVICE && parent.lastData.dailyTokens) {
      this.setAvailableCapabilityValue('meter_power', parent.lastData.dailyTokens.daily_production);
    }
  }
};
