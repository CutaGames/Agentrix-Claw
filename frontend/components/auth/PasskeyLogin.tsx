export function PasskeyLogin() {
  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <span className="text-2xl mr-3">🔐</span>
          <div>
            <div className="font-semibold text-gray-900 mb-1">Passkey 登录</div>
            <div className="text-sm text-gray-600">
              使用生物识别（指纹、面容ID）快速登录，无需密码
            </div>
          </div>
        </div>
      </div>
      
      <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
        使用 Passkey 登录
      </button>
      
      <div className="text-xs text-gray-500 text-center">
        Passkey 提供更安全、更便捷的登录体验
      </div>
    </div>
  )
}
