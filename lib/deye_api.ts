'use strict';

import axios, { AxiosRequestHeaders } from 'axios';
import { sha256 } from 'js-sha256';

const Homey = require('homey');

export enum ON_OFF {
  ON = 'on',
  OFF = 'off'
};

export enum WORK_MODE { 
  SELLING_FIRST = 'SELLING_FIRST', 
  ZERO_EXPORT_TO_LOAD = 'ZERO_EXPORT_TO_LOAD',
  ZERO_EXPORT_TO_CT = 'ZERO_EXPORT_TO_CT'
}

export enum BATTERY_MODE_CONTROL {
  GEN_CHARGE = 'GEN_CHARGE',
  GRID_CHARGE = 'GRID_CHARGE'
}

export enum DATA_CENTER {
  EMEA_APAC = 'EMEA_APAC',
  AMEA = 'AMEA'
}

export interface IDeyeToken {
  accessToken:string;
  refreshToken:string; 
  expiresIn:number;
}

interface IDeyeStationBase {
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
  contactPhone: string;
  ownerName: string;
}

export interface IDeyeStation extends IDeyeStationBase {
  batterySOC: number;
  connectionStatus: string;
  generationPower: number;
  lastUpdateTime: number; 
}

export interface IDeyeStationWithDevice extends IDeyeStationBase {
  type: string;
  deviceTotal: number,
  deviceListItems: {
    deviceSn: string,
    deviceType: string,
    stationId: number
  }[]
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

export interface IDeyeCommissionResponse {
  code: string;
  msg: string;
  success: boolean;
  requestId: string;
  orderId: number;
  collectionTime: number;
  connectionStatus: number;
}

export default class DeyeAPI {

  getDataCenterUrl(dc: DATA_CENTER){
    switch(dc){
      case DATA_CENTER.AMEA :
        return 'us1-developer.deyecloud.com';
      default :
        return 'eu1-developer.deyecloud.com';
    }
  }

  getRequestConfig(method: string, dc: DATA_CENTER, token: IDeyeToken | null, api: string, payload: any): axios.AxiosRequestConfig<any> {
    const config = {
      method: method,
      maxBodyLength: Infinity,
      url: `https://${this.getDataCenterUrl(dc)}${api}`,
      headers: <AxiosRequestHeaders>{
        'Content-Type': 'application/json'
      },
      data : JSON.stringify(payload)
    }

    if(token) config.headers['Authorization'] = `Bearer ${token.accessToken}`;

    return config;
  }

  getPostRequestConfig(dc: DATA_CENTER, token: IDeyeToken | null, api: string, payload: any): axios.AxiosRequestConfig<any> {
    return this.getRequestConfig('post', dc, token, api, payload);
  }

  getGetRequestConfig(dc: DATA_CENTER, token: IDeyeToken | null, api: string, payload: any): axios.AxiosRequestConfig<any> {
    return this.getRequestConfig('get', dc, token, api, payload);
  }

  async login(dc: DATA_CENTER, email: string, password: string): Promise<IDeyeToken> {
    const resp = await axios.request(this.getPostRequestConfig(dc, null, `/v1.0/account/token?appId=${Homey.env[dc].APP_ID}`,{
      appSecret: Homey.env[dc].APP_SECRET,
      email,
      password: sha256(password),
    }));

    if (resp.data?.success) {
      return {
        accessToken: resp.data.accessToken,
        refreshToken: resp.data.refreshToken,
        expiresIn: resp.data.expiresIn,
      };
    }

    throw new Error(`Deye login error! (${resp})`);
  }

  async getStations(dc: DATA_CENTER, token: IDeyeToken): Promise<IDeyeStation[]> {
    const resp = await axios.request(this.getPostRequestConfig(dc,token,'/v1.0/station/list',{
      page: 1,
      size: 10,
    }));

    if(resp.data?.success){
      if(resp.data.total > 0 && resp.data.stationList.length > 0) {
        return resp.data.stationList;
      }

      throw new Error(`No Station found for this account! (${resp.data})`);
    }

    throw new Error(`Error loading Stations list! (${resp})`);
  }

  async getStationsWithDevice(dc: DATA_CENTER, token: IDeyeToken): Promise<IDeyeStationWithDevice[]> {
    const resp = await axios.request(this.getPostRequestConfig(dc,token,'/v1.0/station/listWithDevice',{
      deviceType: "INVERTER",
      page: 1,
      size: 10,
    }));

    if(resp.data?.success){
      if(resp.data.stationTotal > 0 && resp.data.stationList.length > 0) {
        return resp.data.stationList;
      }

      throw new Error(`No Station with Device found for this account! (${resp.data})`);
    }

    throw new Error(`Error loading Station with Device list! (${resp})`);
  }

  async getStationLatest(dc: DATA_CENTER, token: IDeyeToken, stationId: number): Promise<IDeyeStationLatestData> {
    const resp = await axios.request(this.getPostRequestConfig(dc,token,'/v1.0/station/latest',{
      stationId 
    }));

    if(resp.data?.success){
      return resp.data;
    }

    throw new Error(`Error loading Station latest data! (${resp})`);
  }

  async setSolarSell(dc: DATA_CENTER, token: IDeyeToken, deviceSn: string, value: ON_OFF): Promise<IDeyeCommissionResponse> {
    const resp = await axios.request(this.getPostRequestConfig(dc,token,'/v1.0/order/sys/solarSell/control',{
      action: value,
      deviceSn
    }));

    if(resp.data?.success){
      return resp.data;
    }

    throw new Error(`Error setting Solar Sell property to ${value}! (${resp})`);
  }

  async setWorkMode(dc: DATA_CENTER, token: IDeyeToken, deviceSn: string, value: WORK_MODE): Promise<IDeyeCommissionResponse> {
    const resp = await axios.request(this.getPostRequestConfig(dc,token,'/v1.0/order/sys/workMode/update',{
      workMode: value,
      deviceSn
    }));

    if(resp.data?.success){
      return resp.data;
    }

    throw new Error(`Error setting Work Mode property to ${value}! (${resp})`);
  }

  async setBatteryModeControl(dc: DATA_CENTER, token: IDeyeToken, deviceSn: string, type: BATTERY_MODE_CONTROL, value: ON_OFF): Promise<IDeyeCommissionResponse> {
    const resp = await axios.request(this.getPostRequestConfig(dc,token,'/v1.0/order/battery/modeControl',{
      action: value,
      batteryModeType: type,
      deviceSn
    }));

    if(resp.data?.success){
      return resp.data;
    }

    throw new Error(`Error setting Battery Mode Control property to ${value}! (${resp})`);
  }

}