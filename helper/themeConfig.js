import { resolve } from "path";
import { readFileSync } from "fs";
const themeConfigFile = readFileSync(`${resolve("./noobify.theme.txt")}`, "utf8");
const themeConfig = {};

themeConfigFile
  .replace(/['",]/g, "")
  .trim()
  .split("\n")
  .forEach((line) => {
    const [key, value] = line.split("=").map((str) => str.trim());
    themeConfig[key] = value;
  });

export default themeConfig;
