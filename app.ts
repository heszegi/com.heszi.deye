'use strict';

import Homey from 'homey';
import DeyeAPI from './lib/deye_api';
import SolarmanAPI from './lib/solarman_api';

export default class DeyeApp extends Homey.App {
  deyeAPI!: DeyeAPI;
  solarmanAPI!: SolarmanAPI;

  async onInit() {
    this.log('MyApp has been initialized');

    this.deyeAPI = new DeyeAPI();
    this.solarmanAPI = new SolarmanAPI();
  }
}

module.exports = DeyeApp;
