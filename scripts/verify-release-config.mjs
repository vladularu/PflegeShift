import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");

async function readJson(fileName) {
  return JSON.parse(await readFile(resolve(projectRoot, fileName), "utf8"));
}

const [appConfig, easConfig, packageConfig] = await Promise.all([
  readJson("app.json"),
  readJson("eas.json"),
  readJson("package.json"),
]);

const expo = appConfig.expo ?? {};
const failures = [];

function expect(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

expect(expo.name === "PflegeShift", "Der App-Name muss PflegeShift lauten.");
expect(expo.slug === "pflegeshift", "Der Expo-Slug muss pflegeshift lauten.");
expect(expo.scheme === "pflegeshift", "Das Produktions-URL-Schema muss pflegeshift lauten.");
expect(packageConfig.name === "pflegeshift", "Der npm-Paketname muss pflegeshift lauten.");
expect(
  /^\d+\.\d+\.\d+$/.test(expo.version ?? ""),
  "expo.version muss semantisch versioniert sein.",
);
expect(
  expo.version === packageConfig.version,
  "app.json und package.json müssen dieselbe Version verwenden.",
);
expect(
  expo.orientation === "portrait",
  "Die iPhone-first App muss im Hochformat gesperrt bleiben.",
);
expect(expo.userInterfaceStyle === "automatic", "Hell-/Dunkelmodus muss dem System folgen.");
expect(
  expo.ios?.supportsTablet === false,
  "iPad-Support darf erst nach eigener Abnahme aktiviert werden.",
);
expect(
  expo.ios?.bundleIdentifier === "com.pflegeshift.app",
  "Die iOS Bundle-ID ist nicht korrekt.",
);
expect(
  /^\d+(?:\.\d+){0,2}$/.test(expo.ios?.buildNumber ?? ""),
  "ios.buildNumber muss aus einer bis drei numerischen Komponenten bestehen.",
);
expect(
  expo.ios?.config?.usesNonExemptEncryption === false,
  "Die iOS-Export-Compliance-Angabe fehlt.",
);
expect(expo.android?.package === "com.pflegeshift.app", "Der Android-Paketname ist nicht korrekt.");
expect(
  Number.isInteger(expo.android?.versionCode) && expo.android.versionCode > 0,
  "android.versionCode muss positiv sein.",
);
expect(expo.android?.allowBackup === false, "Android-App-Datenbackups müssen deaktiviert sein.");
expect(easConfig.cli?.appVersionSource === "remote", "EAS muss Buildnummern remote verwalten.");
expect(
  easConfig.build?.preview?.distribution === "internal",
  "Preview-Builds müssen intern verteilt werden.",
);
expect(
  easConfig.build?.preview?.env?.APP_VARIANT === "internal",
  "Preview-Builds benötigen eine isolierte App-Identität.",
);
expect(
  easConfig.build?.preview?.env?.EXPO_PUBLIC_ENABLE_DEV_TOOLS === "1",
  "Nur Preview-Builds dürfen das Testlabor aktivieren.",
);
expect(
  easConfig.build?.preview?.autoIncrement === true,
  "Preview-Builds benötigen eindeutige Buildnummern.",
);
expect(
  easConfig.build?.preview?.android?.buildType === "apk",
  "Android Preview muss als installierbare APK gebaut werden.",
);
expect(
  easConfig.build?.production?.autoIncrement === true,
  "Produktions-Builds benötigen eindeutige Buildnummern.",
);
expect(
  easConfig.build?.production?.env?.APP_VARIANT === "production",
  "Produktions-Builds müssen die Produktionsidentität erzwingen.",
);
expect(
  easConfig.build?.production?.env?.EXPO_PUBLIC_ENABLE_DEV_TOOLS === "0",
  "Produktions-Builds müssen das Testlabor deaktivieren.",
);
expect(
  easConfig.build?.production?.android?.buildType === "app-bundle",
  "Android Produktion muss als AAB gebaut werden.",
);
expect(
  easConfig.submit?.production?.android?.track === "internal",
  "Android darf zunächst nur in Internal Testing eingereicht werden.",
);

const splashScreenPlugin = expo.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen",
);
const sqlitePlugin = expo.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === "expo-sqlite",
);
expect(
  sqlitePlugin?.[1]?.useSQLCipher === true,
  "Native Builds müssen expo-sqlite mit SQLCipher erstellen.",
);

const requiredAssets = [
  ["expo.icon", expo.icon],
  ["expo.android.adaptiveIcon.foregroundImage", expo.android?.adaptiveIcon?.foregroundImage],
  ["expo.android.adaptiveIcon.backgroundImage", expo.android?.adaptiveIcon?.backgroundImage],
  ["expo.android.adaptiveIcon.monochromeImage", expo.android?.adaptiveIcon?.monochromeImage],
  ["expo.web.favicon", expo.web?.favicon],
  ["expo-splash-screen image", splashScreenPlugin?.[1]?.image],
];

for (const [assetName, assetPath] of requiredAssets) {
  if (typeof assetPath !== "string" || assetPath.trim().length === 0) {
    failures.push(`Release-Asset ist nicht konfiguriert: ${assetName}`);
    continue;
  }

  try {
    await access(resolve(projectRoot, assetPath), constants.R_OK);
  } catch {
    failures.push(`Release-Asset fehlt oder ist nicht lesbar: ${assetPath}`);
  }
}

if (failures.length > 0) {
  console.error("Lokale Release-Konfiguration ist unvollständig:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Lokale Release-Konfiguration ist konsistent.");
  if (!expo.extra?.eas?.projectId) {
    console.log("Hinweis: EAS projectId wird beim einmaligen `eas init` ergänzt.");
  }
}
