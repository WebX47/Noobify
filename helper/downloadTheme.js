import axios from "axios";
import path from "path";
import { createWriteStream, mkdirSync } from "fs";
import cliProgress from "cli-progress";

export default async function downloadTheme({ store, themeid, accessToken }) {
  if (!store && !themeid && !accessToken) {
    console.error("Provide store URL, theme ID, and access token.");
    return;
  }

  try {
    const response = await axios.get(`https://${store}/admin/api/2023-07/themes/${themeid}/assets.json`, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
      },
    });

    const assets = response.data.assets;

    const progressBar = new cliProgress.SingleBar({
      format: "Theme Fetching |{bar}| {percentage}% | {value}/{total}",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: false,
    });

    progressBar.start(assets.length, 0);

    await Promise.all(
      assets.map(async (asset, index) => {
        await new Promise((resolve) => setTimeout(resolve, 500 * index));

        const assetResponse = await axios.get(
          `https://${store}/admin/api/2023-07/themes/${themeid}/assets.json?asset[key]=${asset.key}`,
          {
            headers: {
              "X-Shopify-Access-Token": accessToken,
            },
          }
        );

        const assetValue = assetResponse.data.asset.value;

        if (assetValue) {
          const outputPath = path.join("src", asset.key);
          mkdirSync(path.dirname(outputPath), { recursive: true });

          const writer = createWriteStream(outputPath);
          writer.write(assetValue);
          writer.end();

          await new Promise((resolve) => {
            writer.on("finish", resolve);
            writer.on("error", (error) => {
              console.error(`Error writing asset ${asset.key} to file:`, error);
              resolve(); // Resolve even if there's an error to continue with the loop
            });
          });

          progressBar.increment();
        } else {
          console.error(`Asset ${asset.key} does not have a value.`);
        }
      })
    );

    progressBar.stop();
    console.log("All assets downloaded successfully.");
  } catch (error) {
    console.error(error);
  }
}