import Homey from 'homey';
import DeyeStationInverter from './devices/deyeStationInverter';

export interface ICapabilityList{
  id: string;
  title?: string;
}

export default class DeyeStationDevice extends Homey.Device {
  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(`${this.constructor.name} has been initialized`);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log(`${this.constructor.name} has been added`);
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
    this.log(`${this.constructor.name} settings where changed`);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log(`${this.constructor.name} was renamed`);
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
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

        if(cap.title){
          await this.setCapabilityOptions(cap.id, { title: { en: cap.title } });
        }
      }
    }
  }

  setCapabilitiyValues(parent: DeyeStationInverter) {
    if(!this.getAvailable()) this.setAvailable();

    this.setAvailableCapabilityValue('address', parent.getCapabilityValue('address'));
    this.setAvailableCapabilityValue('owner', parent.getCapabilityValue('owner'));
    this.setAvailableCapabilityValue('inverter_sn', parent.getCapabilityValue('inverter_sn'));
  }

  setAvailableCapabilityValue(capabilityId: string, value: any): Promise<void> {
    if(this.hasCapability(capabilityId)) {
      return this.setCapabilityValue(capabilityId, value);
    }
    return Promise.resolve();
  }
};
