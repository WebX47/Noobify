import axios from "axios";
import path from "path";
import { createWriteStream, mkdirSync, existsSync, statSync } from "fs";
import cliProgress from "cli-progress";

export default async function downloadTheme({ store, themeid, accessToken }) {
  if (!store || !themeid || !accessToken) {
    console.error("Provide store URL, theme ID, and access token.");
    return;
  }

  const MAX_RETRY_COUNT = 20;
  const RETRY_DELAY_MS = 500;

  try {
    const response = await axios.get(`https://${store}/admin/api/2023-07/themes/${themeid}/assets.json`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    });

    const assets = response.data.assets;
    const totalAssets = assets.length;

    let skippedAssets = 0;

    for (let index = 0; index < assets.length; index++) {
      const asset = assets[index];
      const outputPath = path.join("src", asset.key);

      if (existsSync(outputPath) && !needsRedownload(outputPath, asset)) {
        skippedAssets++;
      }
    }

    if (skippedAssets > 0) {
      console.log(`${skippedAssets} already existing up-to-date files skipped.`);
    }

    const progressBar = new cliProgress.SingleBar({
      format: "Theme Fetching |{bar}| {percentage}% | {value}/{total}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: false,
    });

    progressBar.start(totalAssets, 0);
    progressBar.update(null, skippedAssets);

    let downloadedAssets = 0;

    for (let index = 0; index < assets.length; index++) {
      let retryCount = 0;
      let downloadSuccess = false;

      const asset = assets[index];
      const outputPath = path.join("src", asset.key);

      if (existsSync(outputPath) && !needsRedownload(outputPath, asset)) {
        progressBar.increment();
        downloadedAssets++;
        continue;
      }

      while (retryCount <= MAX_RETRY_COUNT && !downloadSuccess) {
        try {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

          const assetResponse = await axios.get(
            `https://${store}/admin/api/2023-07/themes/${themeid}/assets.json?asset[key]=${asset.key}`,
            {
              headers: {
                "X-Shopify-Access-Token": accessToken,
              },
            }
          );

          const assetData = assetResponse.data.asset;
          mkdirSync(path.dirname(outputPath), { recursive: true });

          let writer;

          if (assetData.attachment) {
            const buffer = Buffer.from(assetData.attachment, "base64");
            writer = createWriteStream(outputPath);
            writer.write(buffer);
            writer.end();
          } else if (assetData.value) {
            writer = createWriteStream(outputPath);
            writer.write(assetData.value);
            writer.end();
          } else {
            console.error(`Asset ${asset.key} does not have a "value" or "attachment" property.`);
          }

          await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", (error) => {
              console.error(`Error writing asset ${asset.key} to file:`, error);
              reject(error);
            });
          });

          downloadSuccess = true;
        } catch (error) {
          retryCount++;
          console.error(`Error downloading asset ${asset.key}. Retry ${retryCount}`);
        }
      }

      if (downloadSuccess) {
        progressBar.increment();
        downloadedAssets++;
      } else {
        console.error(`Failed to download asset ${asset.key} after ${MAX_RETRY_COUNT} retries.`);
      }
    }

    progressBar.stop();
    console.log(`Downloaded ${downloadedAssets} assets successfully.`);
  } catch (error) {
    console.error(error);
  }
}

function needsRedownload(outputPath, asset) {
  if (!existsSync(outputPath)) {
    return true;
  }

  const localFileStats = statSync(outputPath);
  const localFileModifiedTime = localFileStats.mtimeMs;
  const serverFileModifiedTime = Date.parse(asset.updated_at);

  return localFileModifiedTime < serverFileModifiedTime;
}
