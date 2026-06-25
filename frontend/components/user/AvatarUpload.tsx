import { useState, useRef } from 'react'
import { useToast } from '../../contexts/ToastContext'

interface AvatarUploadProps {
  currentAvatar?: string
  onUploadComplete?: (url: string) => void
  size?: 'sm' | 'md' | 'lg'
}

export function AvatarUpload({ currentAvatar, onUploadComplete, size = 'md' }: AvatarUploadProps) {
  const [avatar, setAvatar] = useState<string | undefined>(currentAvatar)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const toast = useToast()

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }

    // 验证文件大小 (最大 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('图片大小不能超过 5MB')
      return
    }

    setIsUploading(true)

    try {
      // 创建预览
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        setAvatar(result)
      }
      reader.readAsDataURL(file)

      // 上传到服务器
      const { userApi } = await import('../../lib/api/user.api')
      const response = await userApi.uploadAvatar(file)
      const avatarUrl = response.avatarUrl

      setAvatar(avatarUrl)
      onUploadComplete?.(avatarUrl)
      toast.success('头像上传成功！')
    } catch (error: any) {
      console.error('头像上传失败:', error)
      toast.error(error.message || '头像上传失败，请重试')
    } finally {
      setIsUploading(false)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="flex flex-col items-center space-y-3">
      <div className="relative">
        <div
          className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-semibold cursor-pointer overflow-hidden group relative`}
          onClick={handleClick}
        >
          {avatar ? (
            <img src={avatar} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span>U</span>
          )}
          {isUploading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center">
            <span className="text-white text-sm opacity-0 group-hover:opacity-100 transition-opacity">
              {isUploading ? '上传中...' : '点击上传'}
            </span>
          </div>
        </div>
        {!isUploading && (
          <div className="absolute bottom-0 right-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-blue-700 transition-colors shadow-lg">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <div className="text-center">
        <button
          onClick={handleClick}
          disabled={isUploading}
          className="text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400"
        >
          {isUploading ? '上传中...' : '更换头像'}
        </button>
        <p className="text-xs text-gray-500 mt-1">支持 JPG、PNG，最大 5MB</p>
      </div>
    </div>
  )
}

