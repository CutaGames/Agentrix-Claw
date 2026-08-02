const fs = require('fs');
const path = require('path');
const {
	createRunOncePlugin,
	withAndroidManifest,
	withDangerousMod,
	withXcodeProject,
} = require('@expo/config-plugins');

const withLlamaRN = (config, options = {}) => {
	const {
		enableEntitlements = true,
		entitlementsProfile = 'production',
		forceCxx20 = true,
		enableOpenCLAndHexagon = true,
		enableOpenCL = true,
	} = options;

	const easProfile = process.env.EAS_BUILD_PROFILE || '';
	const entitlementsProfiles = Array.isArray(entitlementsProfile)
		? entitlementsProfile
		: [entitlementsProfile];
	const isProdProfile =
		process.env.NODE_ENV === 'production' || entitlementsProfiles.includes(easProfile);

	if (enableEntitlements && isProdProfile) {
		config.ios = config.ios || {};
		config.ios.entitlements = config.ios.entitlements || {};
		config.ios.entitlements['com.apple.developer.kernel.extended-virtual-addressing'] = true;
		config.ios.entitlements['com.apple.developer.kernel.increased-memory-limit'] = true;
	}

	if (forceCxx20) {
		config = withXcodeProject(config, (projectConfig) => {
			const project = projectConfig.modResults;
			const buildConfigs = project.pbxXCBuildConfigurationSection();
			Object.values(buildConfigs).forEach((buildConfig) => {
				if (typeof buildConfig !== 'object' || !buildConfig.buildSettings) {
					return;
				}

				buildConfig.buildSettings.CLANG_CXX_LANGUAGE_STANDARD = '"gnu++20"';
				buildConfig.buildSettings.CLANG_CXX_LIBRARY = '"libc++"';
				const currentFlags = String(
					buildConfig.buildSettings.OTHER_CPLUSPLUSFLAGS || '$(inherited)',
				);
				buildConfig.buildSettings.OTHER_CPLUSPLUSFLAGS = currentFlags.includes('-std=gnu++20')
					? currentFlags.startsWith('"')
						? currentFlags
						: `"${currentFlags}"`
					: '"$(inherited) -std=gnu++20"';
			});
			return projectConfig;
		});

		config = withDangerousMod(config, [
			'ios',
			async (dangerousConfig) => {
				const podfilePath = path.join(dangerousConfig.modRequest.projectRoot, 'ios', 'Podfile');
				if (!fs.existsSync(podfilePath)) {
					return dangerousConfig;
				}

				const contents = fs.readFileSync(podfilePath, 'utf8');
				if (contents.includes('LLAMA_RN_CXX20')) {
					return dangerousConfig;
				}

				const postInstallIndex = contents.indexOf('post_install do |installer|');
				if (postInstallIndex === -1) {
					return dangerousConfig;
				}

				const endIndex = contents.indexOf('\n  end', postInstallIndex);
				if (endIndex === -1) {
					return dangerousConfig;
				}

				const insert = `
		# LLAMA_RN_CXX20: Force C++20 on all Pods
		installer.pods_project.targets.each do |target|
			target.build_configurations.each do |config|
				config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'gnu++20'
				config.build_settings['CLANG_CXX_LIBRARY'] = 'libc++'
				config.build_settings['OTHER_CPLUSPLUSFLAGS'] = '$(inherited) -std=gnu++20'
			end
		end
`;
				const updated = contents.slice(0, endIndex) + insert + contents.slice(endIndex);
				fs.writeFileSync(podfilePath, updated);
				return dangerousConfig;
			},
		]);
	}

	if (enableOpenCL && enableOpenCLAndHexagon) {
		config = withAndroidManifest(config, (manifestConfig) => {
			const application = manifestConfig.modResults.manifest.application?.[0];
			if (!application) {
				return manifestConfig;
			}

			application['uses-native-library'] = application['uses-native-library'] || [];
			const libraries = application['uses-native-library'];
			const hasOpenCl = libraries.some((library) => library.$['android:name'] === 'libOpenCL.so');
			const hasCdspRpc = libraries.some((library) => library.$['android:name'] === 'libcdsprpc.so');

			if (!hasOpenCl) {
				libraries.push({
					$: {
						'android:name': 'libOpenCL.so',
						'android:required': 'false',
					},
				});
			}

			if (!hasCdspRpc) {
				libraries.push({
					$: {
						'android:name': 'libcdsprpc.so',
						'android:required': 'false',
					},
				});
			}

			return manifestConfig;
		});
	}

	return config;
};

module.exports = createRunOncePlugin(withLlamaRN, 'llama-rn-plugin', '1.0.0');