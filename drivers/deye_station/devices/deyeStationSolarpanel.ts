import DeyeStationInverter, { LatestDataSource } from './deyeStationInverter';
import DeyeStationDevice from '../device';

export default class DeyeStationSolarpanel extends DeyeStationDevice {

  override async onInit() {
    super.onInit();

    await this.setClass('solarpanel');
    await this.setupCapabilites(
      [],
      [
        { id: 'solar_production' },
        { id: 'measure_power', options: { 
          title: { en: this.homey.__('device.solarpanel.measure_power') },
          icon: '/assets/solar_power.svg'
        }},
        { id: 'meter_power', options: { 
          title: { en: this.homey.__('device.solarpanel.meter_power') },
          icon: '/assets/daily_production.svg'
        }}
      ]
    );
    await this.setEnergy({
      'meterPowerExportedCapability': 'meter_power'
    });

    this.setUnavailable(this.homey.__('device.waiting_for_inverter'));
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
