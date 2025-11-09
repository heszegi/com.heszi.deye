'use strict';

import Homey from 'homey';
import DeyeAPI from './lib/deye_api';

export default class DeyeApp extends Homey.App {
  api!: DeyeAPI;

  readonly updateNotes = [
    {
      version: '1.4.0',
      date: '2025.11.08',
      changes: 'Homey Energy feature is finally supported! 🎉 Two new devices (Battery and Solar Panel) are now available for Deye Station to update the Energy tab metrics. 👉 To add them, go to Add New Device ➜ Deye Solar System app.'
    }
  ]

  async onInit() {
    this.log('MyApp has been initialized');

    this.updateNotes.forEach(note => {
      if (note.version === this.manifest.version) {
        if(this.homey.settings.get('last_update_note') === note.version) return;

        this.homey.settings.set('last_update_note', note.version);
        this.homey.notifications.createNotification({ 
          excerpt: `☀️ Deye Solar Systems (v${note.version}): ${note.changes}`,
        });
      }
    });
    
    this.api = new DeyeAPI();
  }
}

module.exports = DeyeApp;
