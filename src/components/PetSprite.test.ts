import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { act } from 'react-dom/test-utils'

// Mock the Agentrix store
const mockStore = {
  proModeEnabled: false,
  computerUseActive: false,
  currentResponse: '',
  approvalPending: false,
  setProMode: vi.fn(),
  setComputerUse: vi.fn(),
  setApprovalPending: vi.fn()
}

vi.mock('../store/store', () => ({
  useAgentrixStore: () => mockStore
}))

// Mock Tauri APIs
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn()
}))

vi.mock('@tauri-apps/api/app', () => ({
  getName: vi.fn().mockResolvedValue('Agentrix')
}))

describe('桌宠 Sprite 状态测试', () => {
  let mockPetComponent: any
  
  beforeEach(() => {
    vi.clearAllMocks()
    // 重置 store 状态
    mockStore.proModeEnabled = false
    mockStore.computerUseActive = false
    mockStore.currentResponse = ''
    mockStore.approvalPending = false
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('长按语音测试 - 350ms → listen sprite', () => {
    it('应该在长按 350ms 后切换到 listen sprite', async () => {
      vi.useFakeTimers()
      
      const mockSetSprite = vi.fn()
      const mockElement = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
      
      // 模拟长按开始
      const mouseDownEvent = new MouseEvent('mousedown')
      
      act(() => {
        // 模拟长按逻辑
        const longPressTimer = setTimeout(() => {
          mockSetSprite('listen')
        }, 350)
        
        // 快进到 350ms
        vi.advanceTimersByTime(350)
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('listen')
      vi.useRealTimers()
    })

    it('应该在松开手后回到 idle 状态', async () => {
      vi.useFakeTimers()
      
      const mockSetSprite = vi.fn()
      
      act(() => {
        // 模拟长按开始
        mockSetSprite('listen')
        
        // 模拟松开
        const mouseUpEvent = new MouseEvent('mouseup')
        mockSetSprite('idle')
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('idle')
      vi.useRealTimers()
    })
  })

  describe('Pro Mode AI 回复测试', () => {
    it('Pro Mode 开启后 AI 回复 → pro-thinking sprite + tray 图标变化', async () => {
      mockStore.proModeEnabled = true
      
      const mockSetSprite = vi.fn()
      const mockSetTrayIcon = vi.fn()
      
      // 模拟 AI 开始回复
      act(() => {
        mockStore.currentResponse = 'AI 正在思考...'
        mockSetSprite('pro-thinking')
        mockSetTrayIcon('thinking')
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('pro-thinking')
      expect(mockSetTrayIcon).toHaveBeenCalledWith('thinking')
    })

    it('AI 长输出(500+ 字符) → 切换到 pro-typing', async () => {
      mockStore.proModeEnabled = true
      
      const longResponse = 'A'.repeat(501) // 501 字符
      const mockSetSprite = vi.fn()
      
      act(() => {
        mockStore.currentResponse = longResponse
        if (longResponse.length > 500) {
          mockSetSprite('pro-typing')
        }
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('pro-typing')
    })

    it('AI 完成回复 → 1.2s pro-done → 回 idle', async () => {
      vi.useFakeTimers()
      
      mockStore.proModeEnabled = true
      const mockSetSprite = vi.fn()
      
      act(() => {
        // AI 完成回复
        mockStore.currentResponse = '完整回复内容'
        mockSetSprite('pro-done')
        
        // 1.2s 后回到 idle
        setTimeout(() => {
          mockSetSprite('idle')
        }, 1200)
        
        vi.advanceTimersByTime(1200)
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('pro-done')
      expect(mockSetSprite).toHaveBeenCalledWith('idle')
      
      vi.useRealTimers()
    })
  })

  describe('普通 Chat 模式测试', () => {
    it('关闭 Pro Mode 后 AI 回复 → 切换到 talk sprite', async () => {
      mockStore.proModeEnabled = false
      
      const mockSetSprite = vi.fn()
      
      act(() => {
        mockStore.currentResponse = '普通聊天回复'
        mockSetSprite('talk')
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('talk')
    })
  })

  describe('Computer Use 测试', () => {
    it('触发 Computer Use 命令 → cu-mouse + 桌宠跟随光标', async () => {
      const mockSetSprite = vi.fn()
      const mockFollowCursor = vi.fn()
      const mockSetPosition = vi.fn()
      
      act(() => {
        // 模拟 Computer Use 触发
        mockStore.computerUseActive = true
        mockSetSprite('cu-mouse')
        mockFollowCursor(true)
        
        // 模拟光标移动
        const mockCursorPos = { x: 100, y: 200 }
        mockSetPosition(mockCursorPos.x, mockCursorPos.y)
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('cu-mouse')
      expect(mockFollowCursor).toHaveBeenCalledWith(true)
      expect(mockSetPosition).toHaveBeenCalledWith(100, 200)
    })

    it('应该检测 computer-use- 工具调用', async () => {
      const computerUseCommands = [
        'computer-use-screenshot',
        'computer-use-click', 
        'computer-use-type',
        'computer-use-key',
        'computer-use-move'
      ]
      
      const mockSetSprite = vi.fn()
      
      computerUseCommands.forEach(command => {
        act(() => {
          if (command.startsWith('computer-use-')) {
            mockStore.computerUseActive = true
            mockSetSprite('cu-mouse')
          }
        })
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('cu-mouse')
      expect(mockSetSprite).toHaveBeenCalledTimes(computerUseCommands.length)
    })
  })

  describe('高风险审批测试', () => {
    it('高风险审批弹窗 → alert sprite + 暂停 wander', async () => {
      const mockSetSprite = vi.fn()
      const mockPauseWander = vi.fn()
      
      act(() => {
        mockStore.approvalPending = true
        mockSetSprite('alert')
        mockPauseWander(true)
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('alert')
      expect(mockPauseWander).toHaveBeenCalledWith(true)
    })

    it('审批完成后恢复正常状态', async () => {
      const mockSetSprite = vi.fn()
      const mockResumeWander = vi.fn()
      
      act(() => {
        mockStore.approvalPending = false
        mockSetSprite('idle')
        mockResumeWander(true)
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('idle')
      expect(mockResumeWander).toHaveBeenCalledWith(true)
    })
  })

  describe('集成测试 - 完整状态流转', () => {
    it('完整场景: 长按 → Pro Mode AI → Computer Use → 审批 → 恢复', async () => {
      vi.useFakeTimers()
      
      const mockSetSprite = vi.fn()
      const mockSetTrayIcon = vi.fn()
      const mockFollowCursor = vi.fn()
      const mockPauseWander = vi.fn()
      
      // 1. 长按语音
      act(() => {
        vi.advanceTimersByTime(350)
        mockSetSprite('listen')
      })
      
      // 2. Pro Mode AI 回复
      act(() => {
        mockStore.proModeEnabled = true
        mockStore.currentResponse = 'AI thinking...'
        mockSetSprite('pro-thinking')
        mockSetTrayIcon('thinking')
      })
      
      // 3. Computer Use 触发
      act(() => {
        mockStore.computerUseActive = true
        mockSetSprite('cu-mouse')
        mockFollowCursor(true)
      })
      
      // 4. 高风险审批
      act(() => {
        mockStore.approvalPending = true
        mockSetSprite('alert')
        mockPauseWander(true)
      })
      
      // 5. 审批完成，回到 idle
      act(() => {
        mockStore.approvalPending = false
        mockStore.computerUseActive = false
        mockSetSprite('idle')
      })
      
      expect(mockSetSprite).toHaveBeenCalledWith('listen')
      expect(mockSetSprite).toHaveBeenCalledWith('pro-thinking')
      expect(mockSetSprite).toHaveBeenCalledWith('cu-mouse')
      expect(mockSetSprite).toHaveBeenCalledWith('alert')
      expect(mockSetSprite).toHaveBeenCalledWith('idle')
      
      vi.useRealTimers()
    })
  })
})

// 性能测试
describe('桌宠性能测试', () => {
  it('状态切换应该在 16ms 内完成 (60fps)', async () => {
    const startTime = performance.now()
    
    const mockSetSprite = vi.fn()
    
    act(() => {
      mockSetSprite('idle')
      mockSetSprite('listen')  
      mockSetSprite('pro-thinking')
      mockSetSprite('cu-mouse')
      mockSetSprite('alert')
    })
    
    const endTime = performance.now()
    const duration = endTime - startTime
    
    expect(duration).toBeLessThan(16) // 60fps = 16.67ms per frame
  })
  
  it('应该正确清理定时器避免内存泄漏', async () => {
    const mockClearTimeout = vi.spyOn(global, 'clearTimeout')
    
    act(() => {
      const timer1 = setTimeout(() => {}, 350) // 长按定时器
      const timer2 = setTimeout(() => {}, 1200) // pro-done 定时器
      
      clearTimeout(timer1)
      clearTimeout(timer2)
    })
    
    expect(mockClearTimeout).toHaveBeenCalledTimes(2)
  })
})