const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "..", "src-tauri", "tauri.conf.json");
const requireSigning = String(process.env.REQUIRE_WINDOWS_SIGNING || "").toLowerCase() === "true";
const thumbprint = String(process.env.WINDOWS_CERTIFICATE_THUMBPRINT || "").trim();

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
config.bundle = config.bundle || {};
config.bundle.windows = config.bundle.windows || {};

if (thumbprint) {
  config.bundle.windows.certificateThumbprint = thumbprint;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log("Configured Windows Authenticode certificate thumbprint for Tauri bundling.");
  process.exit(0);
}

if (requireSigning) {
  console.error("Windows signing is required for desktop release tags, but WINDOWS_CERTIFICATE_THUMBPRINT is not configured.");
  console.error("Add the certificate to the Windows runner certificate store and set the WINDOWS_CERTIFICATE_THUMBPRINT secret.");
  process.exit(1);
}

console.warn("WINDOWS_CERTIFICATE_THUMBPRINT is not configured. Local/dev Windows bundles will be unsigned.");