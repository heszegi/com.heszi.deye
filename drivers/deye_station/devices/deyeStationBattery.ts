import DeyeStationInverter, { LatestDataSource } from './deyeStationInverter';
import DeyeStationDevice from '../device';

export default class DeyeStationBattery extends DeyeStationDevice {

  override async onInit() {
    super.onInit();

    await this.setClass('battery');
    await this.setupCapabilites(
      [],
      [
        { id: 'battery_charging' },
        { id: 'measure_battery' },
        { id: 'measure_battery_temperature' },
        { id: 'measure_power', options: { 
          title: { en: this.homey.__('device.battery.measure_power') },
          icon: '/assets/battery_power.svg'
        }},
        { id: "meter_power.charged", options: { 
          title: { en: this.homey.__('device.battery.meter_power.charged') },
          icon: '/assets/battery_charged.svg'
        }},
        { id: "meter_power.discharged", options: { 
          title: { en: this.homey.__('device.battery.meter_power.discharged') },
          icon: '/assets/battery_discharged.svg'
        }}
      ]
    );
    await this.setEnergy({
      'homeBattery': true,
      'meterPowerImportedCapability': 'meter_power.charged',
      'meterPowerExportedCapability': 'meter_power.discharged'
    });

    this.setUnavailable(this.homey.__('device.waiting_for_inverter'));
  }

  override setCapabilitiyValues(parent: DeyeStationInverter) {
    super.setCapabilitiyValues(parent);

    this.setAvailableCapabilityValue('battery_charging', parent.lastData.battery_charging);
    this.setAvailableCapabilityValue('measure_battery', parent.lastData.dataTokens.measure_battery);
    this.setAvailableCapabilityValue('measure_battery_temperature', parent.lastData.dataTokens.measure_battery_temperature);
    this.setAvailableCapabilityValue('measure_power', parent.lastData.dataTokens.measure_battery_power * -1);

    if (parent.lastData.type === LatestDataSource.DEVICE && parent.lastData.dailyTokens) {
      this.setAvailableCapabilityValue('meter_power.charged', parent.lastData.dailyTokens.daily_charge);
      this.setAvailableCapabilityValue('meter_power.discharged', parent.lastData.dailyTokens.daily_discharge);
    }
  }
};
