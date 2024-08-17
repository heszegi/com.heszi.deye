'use strict';

import axios from 'axios';
import { sha256 } from 'js-sha256';

const Homey = require('homey');

export interface IDeyeToken {
  accessToken:string;
  refreshToken:string; 
  expiresIn:number;
}

export interface IDeyeStation {
  id: number;
  name: string;
  locationLat: number;
  locationLng: number;
  locationAddress: string;
  regionNationId: number;
  regionTimezone: string;
  gridInterconnectionType: string;
  installedCapacity: number;
  startOperatingTime: number;
  createdDate: number;
  batterySOC: number;
  connectionStatus: string;
  generationPower: number;
  lastUpdateTime: number; 
  contactPhone: string;
  ownerName: string;
}

export interface IDeyeStationLatestData {
    generationPower: number;
    consumptionPower: number;
    gridPower: number;
    purchasePower: number;
    wirePower: number;
    chargePower: number;
    dischargePower: number;
    batteryPower: number;
    batterySOC: number;
    irradiateIntensity: number;
    lastUpdateTime: number;
}

export default class DeyeAPI {
  async login(email: string, password: string): Promise<IDeyeToken> {

    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: `https://eu1-developer.deyecloud.com/v1.0/account/token?appId=${Homey.env.APP_ID}`,
      headers: {
        'Content-Type': 'application/json',
      },
      data: JSON.stringify({
        appSecret: Homey.env.APP_SECRET,
        email,
        password: sha256(password),
      }),
    };

    const resp = await axios.request(config);

    if (resp.data.success) {
      return {
        accessToken: resp.data.accessToken,
        refreshToken: resp.data.refreshToken,
        expiresIn: resp.data.expiresIn,
      };
    }

    throw new Error('Deye login error!');
  }

  async getStations(token: IDeyeToken) :Promise<IDeyeStation[]> {
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://eu1-developer.deyecloud.com/v1.0/station/list',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token.accessToken}`,
      },
      data: JSON.stringify({
        page: 1,
        size: 1,
      }),
    };

    const resp = await axios.request(config);

    if(resp.data.success){
      if(resp.data.stationList.length > 0) {
        return resp.data.stationList;
      }

      throw new Error('No Station found for this account!');
    }

    throw new Error('Error loading Stations list!');
  }

  async getStationLatest(token: IDeyeToken, stationId: number) :Promise<IDeyeStationLatestData> {
    const config = {
      method: 'post',
      maxBodyLength: Infinity,
      url: 'https://eu1-developer.deyecloud.com/v1.0/station/latest',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${token.accessToken}`,
      },
      data : JSON.stringify({
        stationId 
      })
    };

    const resp = await axios.request(config);

    if(resp.data.success){
      return resp.data;
    }

    throw new Error('Error loading Station latest data!');
  }
}