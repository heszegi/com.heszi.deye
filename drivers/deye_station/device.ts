import Homey from 'homey';
import DeyeStationInverter from './devices/deyeStationInverter';
import DeyeStationDriver, { IKeyValue } from './driver';

export interface ICapabilityList{
  id: string;
  options?: IKeyValue;
}

export default class DeyeStationDevice extends Homey.Device {
  driver!: DeyeStationDriver;

  async onInit() {
    this.log(`${this.constructor.name} has been initialized`);

    this.driver.synchroniseCommonSettings(this);
  }

  async onAdded() {
    this.log(`${this.constructor.name} has been added`);
  }

  async onSettings({ oldSettings, newSettings, changedKeys }: { oldSettings: IKeyValue; newSettings: IKeyValue; changedKeys: IKeyValue; }): Promise<string | void> {
    this.log(`${this.constructor.name} settings have been changed`);

    this.driver.synchroniseCommonSettings(this, newSettings);
  }

  async onRenamed(name: string) {
    this.log(`${this.constructor.name} was renamed`);
  }

  async onDeleted() {
    this.log(`${this.constructor.name} has been deleted`);
  }

  async setupCapabilites(remove: ICapabilityList[], add: ICapabilityList[]) {
    for (const cap of remove){
      if (this.hasCapability(cap.id)) await this.removeCapability(cap.id);
    }

    for (const cap of add){
      if (!this.hasCapability(cap.id)){
        await this.addCapability(cap.id);
        if(cap.options) await this.setCapabilityOptions(cap.id, cap.options);
      }
    }
  }

  setCapabilitiyValues(parent: DeyeStationInverter) { // Only for child devices (battery, solarpanel)
    if(!this.getAvailable()) this.setAvailable();

    this.setAvailableCapabilityValue('inverter_sn', parent.getCapabilityValue('inverter_sn'));
  }

  setAvailableCapabilityValue(capabilityId: string, value: any): Promise<void> {
    if(this.hasCapability(capabilityId)) {
      return this.setCapabilityValue(capabilityId, value);
    }
    return Promise.resolve();
  }
};
