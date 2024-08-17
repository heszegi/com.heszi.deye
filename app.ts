'use strict';

import Homey from 'homey';
import DeyeAPI from './lib/deye_api';

export default class DeyeApp extends Homey.App {
  api!: DeyeAPI;

  async onInit() {
    this.log('MyApp has been initialized');

    this.api = new DeyeAPI();
  }
}

module.exports = DeyeApp;
