import xml2js from "xml2js";
import fs from "fs";
import Buffer from "buffer";
import { promisify } from "util";
import readline from "readline";
import papa, { ParseResult } from "papaparse";

export enum APIKind {
  WFS = "OGC Web Feature Service",
  WMTS = "OGC Web Map Tile Service",
}

export interface KoordinatesDatasetParams {
  koordinatesHost: string;
  name: string;
  layerId?: number;
  tableId?: number;
  apiVersion: string;
  version: string;
  apiKind: APIKind;
  initialDataset: string;
  initialDatasetLocation: string;
  initialDatasetTs: string;
  hasChangesets?: boolean;
  hasSpatialInformation?: boolean;
}

export class KoordinatesDataset {
  private FILE_WRITE_TIMEOUT = 300000;
  private stat = promisify(fs.stat);
  private koordinatesHost: string;
  private name: string;
  private layerId: number;
  private tableId: number;
  private apiVersion: string;
  private version: string;
  private apiKind: APIKind;
  private initialDataset: string;
  private initialDatasetLocation: string;
  private initialDatasetTs: string;
  private hasChangesets: boolean;
  private hasSpatialInformation: boolean;

  constructor(params: KoordinatesDatasetParams) {
    if (params.layerId == undefined && params.tableId == undefined) {
      throw new Error("layerId and tableId cannot be both undefined");
    }

    if (params.layerId != undefined && params.tableId != undefined) {
      throw new Error("layerId and tableId cannot be assigned values");
    }

    this.koordinatesHost = params.koordinatesHost;
    this.name = params.name;
    if (params.layerId != undefined) {
      this.layerId = params.layerId;
    } else {
      this.layerId = -1;
    }
    if (params.tableId != undefined) {
      this.tableId = params.tableId;
    } else {
      this.tableId = -1;
    }
    this.apiKind = params.apiKind;
    this.apiVersion = params.apiVersion;
    this.version = params.version;
    this.initialDatasetTs = params.initialDatasetTs;
    this.initialDatasetLocation = params.initialDatasetLocation;
    this.initialDataset = params.initialDataset;
    if (params.hasChangesets == undefined) {
      this.hasChangesets = false;
    } else {
      this.hasChangesets = params.hasChangesets;
    }
    if (params.hasSpatialInformation == undefined) {
      this.hasSpatialInformation = false;
    } else {
      this.hasSpatialInformation = params.hasSpatialInformation;
    }
  }

  /**
   * Public getters
   */
  getKoordinatesHost(): string {
    return this.koordinatesHost;
  }

  getName(): string {
    return this.name;
  }

  getLayerId(): number {
    return this.layerId;
  }

  getTableId(): number {
    return this.tableId;
  }

  getApiVersion(): string {
    return this.apiVersion;
  }

  getVesion(): string {
    return this.version;
  }

  getApiKind(): string {
    return this.apiKind;
  }

  getInitialDataset(): string {
    return this.initialDataset;
  }

  getInitialDatasetTs(): string {
    return this.initialDatasetTs;
  }

  getInitialDatasetLocation(): string {
    return this.initialDatasetLocation;
  }

  getHasChangesets(): boolean {
    return this.hasChangesets;
  }

  getHasSpatialInformation(): boolean {
    return this.hasSpatialInformation;
  }

  /**
   * Catalog Service for the Web (CS-W). CS-W provides a catalog listing of all
   * public datasets in a Koordinates site.
   *
   * @returns XML String representation of CS-W
   */
  async getWebCatalogServicesXml(): Promise<string> {
    let endpoint: string = `${this.koordinatesHost}/services/csw/?service=CSW&request=GetCapabilities`;
    let resp: Response = await fetch(endpoint);
    let xmlText = await resp.text();
    return xmlText;
  }

  /**
   * Catalog Service for the Web (CS-W). CS-W provides a catalog listing of all
   * public datasets in a Koordinates site.
   *
   * @returns JSON representation of CS-W.
   */
  async getWebCatalogServicesJson(): Promise<any> {
    let xmlText = await this.getWebCatalogServicesXml();
    let json = await this.parseXml(xmlText);
    return json;
  }

  /**
   * Get data layer capabilities in JSON
   *
   * @param apiKey - Koordinates API key
   * @returns JSON representation of data layer capabilities which is converted from XML
   */
  async getLayerCapabilitiesJson(apiKey: string): Promise<any> {
    switch (this.apiKind) {
      case APIKind.WFS:
        return await this.getWfsLayerCapabilitiesJson(apiKey);
      case APIKind.WMTS:
        return await this.getWmtsLayerCapabilitiesJson(apiKey);
      default:
        throw new Error(`Unsupported API kind ${this.apiKind}`);
    }
  }

  private async getWfsLayerCapabilitiesJson(apiKey: string): Promise<any> {
    let xmlText = await this.getWfsLayerCapabilitiesXml(apiKey);
    let json = await this.parseXml(xmlText);
    return json;
  }

  private async getWmtsLayerCapabilitiesJson(apiKey: string): Promise<any> {
    let xmlText = await this.getWmtsLayerCapabilitiesXml(apiKey);
    let json = await this.parseXml(xmlText);
    return json;
  }

  /**
   * Get data layer capabilietes in XML
   *
   * @param apiKey - Koordinates API key
   * @returns XML string
   */
  async getLayerCapabilitiesXml(apiKey: string): Promise<string> {
    switch (this.apiKind) {
      case APIKind.WFS:
        return await this.getWfsLayerCapabilitiesXml(apiKey);
      case APIKind.WMTS:
        return await this.getWmtsLayerCapabilitiesXml(apiKey);
      default:
        throw new Error(`Unsupported API kind ${this.apiKind}`);
    }
  }

  private async getWfsLayerCapabilitiesXml(apiKey: string): Promise<string> {
    let endpoint: string = `${
      this.koordinatesHost
    }/services;key=${apiKey}/wfs/${this.datasetId()}/?service=WFS&request=GetCapabilities`;
    let resp: Response = await fetch(endpoint);
    let xmlText = await resp.text();
    return xmlText;
  }

  private async getWmtsLayerCapabilitiesXml(apiKey: string): Promise<string> {
    let endpoint: string = `${this.koordinatesHost}/services;key=${apiKey}/wmts/${this.version}/layer/${this.layerId}/WMTSCapabilities.xml`;
    let resp: Response = await fetch(endpoint);
    let xmlText = await resp.text();
    return xmlText;
  }

  /**
   * Get data layer capabilietes in JSON
   *
   * @param apiKey - Koordinates API key
   * @returns JSON representation of capabilities of a site.
   */
  async getAllCapabilitiesJson(apiKey: string): Promise<any> {
    switch (this.apiKind) {
      case APIKind.WFS:
        return await this.getAllWfsCapabilitiesJson(apiKey);
      case APIKind.WMTS:
        return await this.getAllWmtsCapabilitiesJson(apiKey);
      default:
        throw new Error(`Unsupported API kind ${this.apiKind}`);
    }
  }

  private async getAllWfsCapabilitiesJson(apiKey: string): Promise<any> {
    let xmlText = await this.getAllWfsCapabilitiesXml(apiKey);
    let json = await this.parseXml(xmlText);
    return json;
  }

  private async getAllWmtsCapabilitiesJson(apiKey: string): Promise<any> {
    let xmlText = await this.getAllWmtsCapabilitiesXml(apiKey);
    let json = await this.parseXml(xmlText);
    return json;
  }

  /**
   * Get data layer capabilietes in XML
   *
   * @param apiKey - Koordinates API key
   * @returns XML string representation of capabilities of a site.
   */
  async getAllCapabilitiesXml(apiKey: string): Promise<string> {
    switch (this.apiKind) {
      case APIKind.WFS:
        return await this.getAllWfsCapabilitiesXml(apiKey);
      case APIKind.WMTS:
        return await this.getAllWmtsCapabilitiesXml(apiKey);
      default:
        throw new Error(`Unsupported API kind ${this.apiKind}`);
    }
  }

  private async getAllWfsCapabilitiesXml(apiKey: string): Promise<string> {
    let endpoint: string = `${this.koordinatesHost}/services;key=${apiKey}/wfs/?service=WFS&request=GetCapabilities`;
    let resp: Response = await fetch(endpoint);
    let xmlText = await resp.text();
    return xmlText;
  }

  private async getAllWmtsCapabilitiesXml(apiKey: string): Promise<string> {
    let endpoint: string = `${this.koordinatesHost}/services;key=${apiKey}/wmts/${this.version}/WMTSCapabilities.xml`;
    let resp: Response = await fetch(endpoint);
    let xmlText = await resp.text();
    return xmlText;
  }

  /**
   * Retrieve Web Feature Service changeset by specified time range
   *
   * @param apiKey
   * @param timestampFrom
   * @param timestampTo
   * @returns A list of changeset objects
   */
  async getWfsChangesets(
    apiKey: string,
    timestampFrom: string,
    timestampTo: string
  ): Promise<any> {
    if (!this.hasChangesets) {
      throw new Error(
        `Changesets API is not supported by dataset ${this.name}.`
      );
    }
    if (this.apiKind != APIKind.WFS) {
      throw new Error(
        "Changesets API is available for WFS (Web Feature Service) only."
      );
    }
    let endpoint: string = `${
      this.koordinatesHost
    }/services;key=${apiKey}/wfs/${this.datasetId()}-changeset?SERVICE=WFS&VERSION=${
      this.version
    }&REQUEST=GetFeature&typeNames=${this.datasetId()}-changeset&viewparams=from:${timestampFrom};to:${timestampTo}&outputFormat=json`;
    let resp: Response = await fetch(endpoint);

    let json = await resp.json();
    return json;
  }

  /**
   * Spatial query API (JSON) for Web Feature Service dataset
   *
   * @param apiKey
   * @param latitude
   * @param longitude
   * @param maxResult
   * @param radius
   * @returns A list of sites in JSON around "latitude" and "longitude" by "radius". The maximum number of records is "maxResult".
   */
  async queryWfsSpatialApiJson(
    apiKey: string,
    latitude: number,
    longitude: number,
    maxResult: number,
    radius: number
  ): Promise<any> {
    if (this.apiKind != APIKind.WFS) {
      throw new Error(
        "This method is applied to Web Feature Service datasets only"
      );
    }
    if (!this.hasSpatialInformation) {
      throw new Error("This dataset does not have spatial information.");
    }

    let endpoint = `${this.koordinatesHost}/services/query/${this.apiVersion}/vector.json?key=${apiKey}&layer=${this.layerId}&x=${longitude}&y=${latitude}&max_results=${maxResult}&radius=${radius}&geometry=true&with_field_names=true`;
    let resp: Response = await fetch(endpoint);

    let json = await resp.json();
    return json;
  }

  /**
   * Spatial query API (XML) for Web Feature Service dataset
   *
   * @param apiKey
   * @param latitude
   * @param longitude
   * @param maxResult
   * @param radius
   * @returns A list of sites in XML string around "latitude" and "longitude" by "radius". The maximum number of records is "maxResult".
   */
  async queryWfsSpatialApiXml(
    apiKey: string,
    latitude: number,
    longitude: number,
    maxResult: number,
    radius: number
  ): Promise<string> {
    if (this.apiKind != APIKind.WFS) {
      throw new Error(
        "This method is applied to Web Feature Service datasets only"
      );
    }
    if (!this.hasSpatialInformation) {
      throw new Error("This dataset does not have spatial information.");
    }

    let endpoint = `${this.koordinatesHost}/services/query/${this.apiVersion}/vector.xml?key=${apiKey}&layer=${this.layerId}&x=${longitude}&y=${latitude}&max_results=${maxResult}&radius=${radius}&geometry=true&with_field_names=true`;
    let resp: Response = await fetch(endpoint);

    let xmlText = await resp.text();
    return xmlText;
  }

  /**
   * Spatial query API (JSON) for Web Map Tile Service dataset
   *
   * @param apiKey
   * @param latitude
   * @param longitude
   * @returns A list of sites in XML string around "latitude" and "longitude".
   */
  async queryWmtsSpatialApiJson(
    apiKey: string,
    latitude: number,
    longitude: number
  ): Promise<any> {
    if (this.apiKind != APIKind.WMTS) {
      throw new Error(
        "This method is applied to Web Map Tile Service datasets only"
      );
    }
    if (!this.hasSpatialInformation) {
      throw new Error("This dataset does not have spatial information.");
    }

    let endpoint = `${this.koordinatesHost}/services/query/${this.apiVersion}/raster.json?key=${apiKey}&layer=${this.layerId}&x=${longitude}&y=${latitude}`;
    let resp: Response = await fetch(endpoint);

    let json = await resp.json();
    return json;
  }

  /**
   * XYZ Tile service query for Web Map Tile Service dataset.
   *
   * @param apiKey
   * @param x
   * @param y
   * @param zoomLevel
   * @returns image in PNG format which is specified by coordinate (x,y) and zoomLevel.
   */
  async queryXyzTileServiceApi(
    apiKey: string,
    x: number,
    y: number,
    zoomLevel: number = 18
  ): Promise<ArrayBuffer> {
    if (this.apiKind != APIKind.WMTS) {
      throw new Error(
        "This method is applied to Web Map Tile Service datasets only"
      );
    }
    let endpoint = `https://tiles-cdn.koordinates.com/services;key=${apiKey}/tiles/v4/layer=${this.layerId}/EPSG:3857/${zoomLevel}/${x}/${y}.png`;
    let resp: Response = await fetch(endpoint);

    let img = await resp.arrayBuffer();
    return img;
  }

  /**
   * Get the number of records in the initial dataset
   *
   * @returns the number of records in the initial dataset.
   */
  async getInitialDatasetCount(): Promise<number> {
    await this.downloadInitialDatasetFromS3();
    const cnt = await this.getRecordCount(`./datasets/${this.initialDataset}`);
    return cnt;
  }

  /**
   * Get a subset of the initial dataset
   *
   * @param start - the start point of batch, starting from 0
   * @param batch  - the size of batch, its maximum value is 100,000
   * @returns a subset of the initial dataset
   */
  async getInitialDatasetInBatch(start: number, batch: number): Promise<any> {
    if (this.apiKind != APIKind.WFS) {
      throw new Error(
        "Initial dataset is available for WFS (Web Feature Service) only."
      );
    }
    if (batch <= 0 || batch > 100000) {
      throw new Error("Batch size must be between 1 and 100000");
    }
    if (Boolean(this.initialDataset) && Boolean(this.initialDatasetTs)) {
      await this.downloadInitialDatasetFromS3();

      const records = await this.readCSVInBatches(
        `./datasets/${this.initialDataset}`,
        start,
        batch
      );
      return records;
    } else if (this.initialDatasetTs) {
      // load from Koordinate website
      console.log("loading initial data from Koordinate website");
    } else {
      throw new Error("Initial dataset timestamp cannot be empty");
    }
  }

  /************************ The methods below are helpers ************************/
  private async downloadInitialDatasetFromS3() {
    if (!fs.existsSync("./datasets")) {
      fs.mkdir("./datasets", () => {
        console.log("./datasets folder exists.");
      });
    }

    // download from S3 if fie does not exist
    const fn = `./datasets/${this.initialDataset}`;
    if (!fs.existsSync(fn)) {
      console.log("started downloading...");
      let downloadReq = await fetch(
        `${this.initialDatasetLocation}/${this.initialDataset}`
      );
      let compressedDataset = await downloadReq.arrayBuffer();

      let buffer = Buffer.Buffer.from(compressedDataset);
      await fs
        .createWriteStream(`./datasets/${this.initialDataset}`)
        .write(buffer);
      await this.waitForFile(fn, this.FILE_WRITE_TIMEOUT);
      console.log("file written!");
    }
  }

  private getRecordCount(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        let count: number = 0;
        const stream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: stream });
        rl.on("line", (row) => {
          count++;
        });

        rl.on("close", () => {
          if (count > 0) {
            count = count - 1;
          }
          resolve(count);
        });
      } catch (err) {
        console.log(err);
        reject(new Error(`Failed reading file ${filePath}`));
      }
    });
  }

  private readCSVInBatches(
    filePath: string,
    start: number,
    batch: number
  ): Promise<any[]> {
    return new Promise((resolve, reject) => {
      try {
        let records: any[] = [];
        let headers: string = "";
        let recordCount: number = 0;
        const stream = fs.createReadStream(filePath);
        const rl = readline.createInterface({ input: stream });
        rl.on("line", (row) => {
          // parsing the header row of CSV file
          if (headers == "") {
            headers = row;
          } else {
            if (recordCount >= start && recordCount < start + batch) {
              const json = this.csvToJson(headers, row);
              if (json != null) {
                records.push(json);
              }
            } else if (recordCount >= start + batch) {
              rl.close();
            }
            recordCount++;
          }
        });

        rl.on("close", () => {
          resolve(records);
        });
      } catch (err) {
        console.log(err);
        reject(new Error(`Failed reading file ${filePath}`));
      }
    });
  }

  private sleep(ms: number): Promise<any> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async waitForFile(
    filePath: string,
    timeout: number
  ): Promise<string | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Check if the file exists
        await this.stat(filePath);
        return "Found";
      } catch (error) {
        await this.sleep(2000);
      }
    }
    return null;
  }

  private csvToJson(headers: string, csv: string) {
    const configObj = {
      quoteChar: '"',
      header: true,
    };
    const papaResp: ParseResult<any> = papa.parse(
      `${headers}\n${csv}`,
      configObj
    );
    return papaResp.data[0];
  }

  private async parseXml(xmlString: string) {
    return await new Promise((resolve, reject) =>
      xml2js.parseString(xmlString, (err, jsonData) => {
        if (err) {
          reject(err);
        }
        resolve(jsonData);
      })
    );
  }

  private datasetId(): string {
    return `${this.tableId > 0 ? "table" : "layer"}-${
      this.tableId > 0 ? this.tableId : this.layerId
    }`;
  }
}
