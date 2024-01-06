import xml2js from "xml2js";
import fs from "fs";
import AdmZip from "adm-zip";
import Buffer from "buffer";
import { promisify } from "util";
import readline from "readline";
import papa, { ParseResult } from "papaparse";

const stat = promisify(fs.stat);

function getRecordCount(filePath: string): Promise<number> {
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
      reject(`Failed reading file ${filePath}`);
    }
  });
}

function readCSVInBatches(
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
            const json = csvToJson(headers, row);
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
      reject(`Failed reading file ${filePath}`);
    }
  });
}

function sleep(ms: number) {
  new Promise((r) => setTimeout(r, ms));
}

async function waitForFile(
  filePath: string,
  timeout: number
): Promise<string | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      // Check if the file exists
      await stat(filePath);
      return "Found";
    } catch (error) {
      await sleep(1000);
    }
  }
  return null;
}

function csvToJson(headers: string, csv: string) {
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

/**
 * Convert XML string to JSON
 *
 * @param xmlString - XML string
 * @returns - JSON object
 */
async function parseXml(xmlString: string) {
  return await new Promise((resolve, reject) =>
    xml2js.parseString(xmlString, (err, jsonData) => {
      if (err) {
        reject(err);
      }
      resolve(jsonData);
    })
  );
}

export enum APIKind {
  WFS = "OGC Web Feature Service",
  WMTS = "OGC Web Map Tile Service",
}

export interface KoordinatesDatasetParams {
  koordinatesHost: string;
  name: string;
  layerId: number;
  apiVersion: string;
  version: string;
  apiKind: APIKind;
  initialDataset: string;
  initialDatasetLocation: string;
  initialDatasetTs: string;
}

export class KoordinatesDataset {
  koordinatesHost: string;
  name: string;
  layerId: number;
  apiVersion: string;
  version: string;
  apiKind: APIKind;
  initialDataset: string;
  initialDatasetLocation: string;
  initialDatasetTs: string;

  constructor(params: KoordinatesDatasetParams) {
    this.koordinatesHost = params.koordinatesHost;
    this.name = params.name;
    this.layerId = params.layerId;
    this.apiKind = params.apiKind;
    this.apiVersion = params.apiVersion;
    this.version = params.version;
    this.initialDatasetTs = params.initialDatasetTs;
    this.initialDatasetLocation = params.initialDatasetLocation;
    this.initialDataset = params.initialDataset;
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
    let json = await parseXml(xmlText);
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
    let json = await parseXml(xmlText);
    return json;
  }

  private async getWmtsLayerCapabilitiesJson(apiKey: string): Promise<any> {
    let xmlText = await this.getWmtsLayerCapabilitiesXml(apiKey);
    let json = await parseXml(xmlText);
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
    let endpoint: string = `${this.koordinatesHost}/services;key=${apiKey}/wfs/layer-${this.layerId}/?service=WFS&request=GetCapabilities`;
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
    let json = await parseXml(xmlText);
    return json;
  }

  private async getAllWmtsCapabilitiesJson(apiKey: string): Promise<any> {
    let xmlText = await this.getAllWmtsCapabilitiesXml(apiKey);
    let json = await parseXml(xmlText);
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
    if (this.apiKind != APIKind.WFS) {
      throw new Error(
        "Changesets API is available for WFS (Web Feature Service) only."
      );
    }
    let endpoint: string = `${this.koordinatesHost}/services;key=${apiKey}/wfs/layer-${this.layerId}-changeset?SERVICE=WFS&VERSION=${this.version}&REQUEST=GetFeature&typeNames=layer-${this.layerId}-changeset&viewparams=from:${timestampFrom};to:${timestampTo}&outputFormat=json`;
    let resp: Response = await fetch(endpoint);

    let json = await resp.json();
    return json;
  }

  // Spatial Query API
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
    let endpoint = `${this.koordinatesHost}/services/query/${this.apiVersion}/vector.json?key=${apiKey}&layer=${this.layerId}&x=${longitude}&y=${latitude}&max_results=${maxResult}&radius=${radius}&geometry=true&with_field_names=true`;
    let resp: Response = await fetch(endpoint);

    let json = await resp.json();
    return json;
  }

  async queryWfsSpatialApiXml(
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
    let endpoint = `${this.koordinatesHost}/services/query/${this.apiVersion}/vector.xml?key=${apiKey}&layer=${this.layerId}&x=${longitude}&y=${latitude}&max_results=${maxResult}&radius=${radius}&geometry=true&with_field_names=true`;
    let resp: Response = await fetch(endpoint);

    let xmlText = await resp.text();
    return xmlText;
  }

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
    let endpoint = `${this.koordinatesHost}/services/query/${this.apiVersion}/raster.json?key=${apiKey}&layer=${this.layerId}&x=${longitude}&y=${latitude}`;
    let resp: Response = await fetch(endpoint);

    let json = await resp.json();
    return json;
  }

  async queryXyzTileServiceApi(
    apiKey: string,
    latitude: number,
    longitude: number,
    zoomLevel: number = 18
  ): Promise<ArrayBuffer> {
    if (this.apiKind != APIKind.WMTS) {
      throw new Error(
        "This method is applied to Web Map Tile Service datasets only"
      );
    }
    let endpoint = `https://tiles-cdn.koordinates.com/services;key=${apiKey}/tiles/v4/layer=${this.layerId}/EPSG:3857/${zoomLevel}/${longitude}/${latitude}.png`;
    let resp: Response = await fetch(endpoint);

    let img = await resp.arrayBuffer();
    return img;
  }

  async getInitialDatasetCount(): Promise<number> {
    await this.downloadInitialDatasetFromS3();
    const cnt = await getRecordCount(`./datasets/${this.initialDataset}`);
    return cnt;
  }

  async getInitialDataset(start: number, batch: number): Promise<any> {
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

      const records = await readCSVInBatches(
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

  private async downloadInitialDatasetFromS3() {
    if (!fs.existsSync("./datasets")) {
      fs.mkdir("./datasets", () => {
        console.log("./datasets folder exists.");
      });
    }

    // download from S3 by file-saver if fie does not exist
    const fn = `./datasets/${this.initialDataset}.zip`;
    if (!fs.existsSync(fn)) {
      let downloadReq = await fetch(
        `${this.initialDatasetLocation}/${this.initialDataset}.zip`
      );
      let compressedDataset = await downloadReq.arrayBuffer();

      let buffer = Buffer.Buffer.from(compressedDataset);
      await fs
        .createWriteStream(`./datasets/${this.initialDataset}.zip`)
        .write(buffer);
    }

    // unzip downloaded file
    const zipFile = `./datasets/${this.initialDataset}.zip`;
    await waitForFile(zipFile, 60000);
    if (!fs.existsSync(`./datasets/${this.initialDataset}`)) {
      const zip = new AdmZip(zipFile);
      zip.extractAllTo("./datasets");
    }
  }
}
