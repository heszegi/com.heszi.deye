import { ModbusRtu } from '@binsoul/nodejs-modbus';
import { SolarmanV5 } from '@binsoul/nodejs-solarman';
import { Socket } from 'net';

export interface ISolarmanLatestData {
    updateTime: number; // Math.floor(Date.now() / 1000)
    battery: number;
    battery_power: number;
    consumption_power: number;
    grid_power: number;
    solar_power: number;
    daily_production: number;
    daily_consumption: number;
    daily_sell: number;
    daily_buy: number;
}

export default class SolarmanAPI {
    private isConnected = false;
    private client = new Socket();
    //private modebus:ModbusRtu;
    //private solarman:SolarmanV5;

    constructor() {
        this.client.on('connect', this.onConnect);        
        this.client.on('error', this.onError);
        this.client.on('timeout', this.client.end);
        this.client.on('data', this.onData);
        this.client.on('close', this.onClose);
    }

    private onConnect() {
        this.isConnected = true;
    }

    private onError(err:Error) {
        console.error(err);
        this.onClose();
    }

    private onData(data:Buffer) {
        console.log(data);
    }

    private onClose() {
        this.isConnected = false;
    }

    async getLatest(ip:string, port:number, unit:number, serial:string): Promise<ISolarmanLatestData> {
        if (!this.isConnected) {
            // itt kell folytatni
            this.client.connect(port, ip);
        }

        return new Promise((resolve, reject) => {
            // itt kell folytatni
        });
    }
}