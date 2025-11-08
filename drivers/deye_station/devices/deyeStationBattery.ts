import DeyeStationInverter, { LatestDataSource } from './deyeStationInverter';
import DeyeStationDevice from '../device';

export default class DeyeStationBattery extends DeyeStationDevice {

  override async onInit() {
    this.log('DeyeStationBattery has been initialized');

    await this.setClass('battery');
    await this.setupCapabilites(
      [],
      [
        { id: 'battery_charging' },
        { id: 'measure_battery' },
        { id: 'measure_power', title: this.homey.__('device.battery.measure_power') },
        { id: "meter_power.charged", title: this.homey.__('device.battery.meter_power.charged') },
        { id: "meter_power.discharged", title: this.homey.__('device.battery.meter_power.discharged') }
      ]
    );
    await this.setEnergy({
      'homeBattery': true,
      'meterPowerImportedCapability': 'meter_power.charged',
      'meterPowerExportedCapability': 'meter_power.discharged'
    });
  }

  override setCapabilitiyValues(parent: DeyeStationInverter) {
    super.setCapabilitiyValues(parent);

    this.setAvailableCapabilityValue('battery_charging', parent.lastData.battery_charging);
    this.setAvailableCapabilityValue('measure_battery', parent.lastData.dataTokens.measure_battery);
    this.setAvailableCapabilityValue('measure_power', parent.lastData.dataTokens.measure_battery_power * -1);

    if (parent.lastData.type === LatestDataSource.DEVICE && parent.lastData.dailyTokens) {
      this.setAvailableCapabilityValue('meter_power.charged', parent.lastData.dailyTokens.daily_charge);
      this.setAvailableCapabilityValue('meter_power.discharged', parent.lastData.dailyTokens.daily_discharge);
    }
  }
};
