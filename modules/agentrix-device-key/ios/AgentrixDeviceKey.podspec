# The phone's device key (src/services/phoneDeviceKey.ts). Apple frameworks only (Security,
# LocalAuthentication); no extra pods. Autolinked as a local Expo module (modules/).
Pod::Spec.new do |s|
  s.name           = 'AgentrixDeviceKey'
  s.version        = '1.0.0'
  s.summary        = 'Agentrix device key in the Secure Enclave'
  s.description    = 'P-256 device key for Agentrix device pairing and signing credentials'
  s.license        = { :type => 'Proprietary' }
  s.author         = 'Agentrix'
  s.homepage       = 'https://agentrix.top'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'Security', 'LocalAuthentication'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = '**/*.{h,m,swift}'
end
