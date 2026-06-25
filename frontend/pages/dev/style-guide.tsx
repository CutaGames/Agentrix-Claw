import Head from 'next/head'

export default function StyleGuide() {
  const colors = [
    { name: 'Primary Blue', value: 'bg-blue-600', text: 'text-white' },
    { name: 'Secondary Gray', value: 'bg-gray-600', text: 'text-white' },
    { name: 'Success Green', value: 'bg-green-600', text: 'text-white' },
    { name: 'Warning Yellow', value: 'bg-yellow-500', text: 'text-gray-900' },
    { name: 'Error Red', value: 'bg-red-600', text: 'text-white' }
  ]

  const buttons = [
    { variant: 'primary', style: 'bg-blue-600 text-white hover:bg-blue-700' },
    { variant: 'secondary', style: 'bg-gray-200 text-gray-700 hover:bg-gray-300' },
    { variant: 'success', style: 'bg-green-600 text-white hover:bg-green-700' },
    { variant: 'danger', style: 'bg-red-600 text-white hover:bg-red-700' },
    { variant: 'outline', style: 'border border-gray-300 text-gray-700 hover:bg-gray-50' }
  ]

  return (
    <>
      <Head>
        <title>设计规范 - Agentrix</title>
      </Head>
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Agentrix 设计系统</h1>
            <p className="text-xl text-gray-600">统一的设计规范和组件标准</p>
          </div>

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">色彩系统</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {colors.map((color) => (
                <div key={color.name} className="text-center">
                  <div className={`w-full h-20 rounded-lg ${color.value} flex items-center justify-center ${color.text} mb-2`}>
                    {color.name}
                  </div>
                  <p className="text-sm text-gray-600">{color.name}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">按钮样式</h2>
            <div className="space-y-4">
              {buttons.map((button) => (
                <div key={button.variant} className="flex items-center space-x-4">
                  <span className="w-32 text-sm text-gray-600 capitalize">{button.variant}</span>
                  <button className={`px-4 py-2 rounded-lg font-medium transition-colors ${button.style}`}>
                    {button.variant} Button
                  </button>
                  <button className={`px-4 py-2 rounded-lg font-medium transition-colors opacity-50 ${button.style}`}>
                    Disabled
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">文字排版</h2>
            <div className="space-y-4">
              <div>
                <h1 className="text-4xl font-bold text-gray-900 mb-2">Heading 1 - 36px Bold</h1>
                <p className="text-gray-600">用于页面主标题</p>
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900 mb-2">Heading 2 - 30px Bold</h2>
                <p className="text-gray-600">用于章节标题</p>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Heading 3 - 24px Bold</h3>
                <p className="text-gray-600">用于小标题</p>
              </div>
              <div>
                <p className="text-lg text-gray-900 mb-2">Body Large - 18px Regular</p>
                <p className="text-gray-600">用于正文大文字</p>
              </div>
              <div>
                <p className="text-base text-gray-900 mb-2">Body Regular - 16px Regular</p>
                <p className="text-gray-600">用于普通正文</p>
              </div>
              <div>
                <p className="text-sm text-gray-900 mb-2">Body Small - 14px Regular</p>
                <p className="text-gray-600">用于辅助文字</p>
              </div>
            </div>
          </section>

          <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">表单元素</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">输入框</label>
                <input
                  type="text"
                  placeholder="普通输入框"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">选择框</label>
                <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option>选项一</option>
                  <option>选项二</option>
                  <option>选项三</option>
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
