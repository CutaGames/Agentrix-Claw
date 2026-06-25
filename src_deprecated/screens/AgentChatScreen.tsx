import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { sendAgentMessage, getAgentHistory } from '../services/openclaw.service';
import { useAuthStore } from '../stores/authStore';

type RootStackParamList = {
  AgentChat: { agentId: string; agentName: string; instanceId?: string };
};

type Props = NativeStackScreenProps<RootStackParamList, 'AgentChat'>;

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function AgentChatScreen({ route }: Props) {
  const { agentName, instanceId: routeInstanceId } = route.params;
  const activeInstance = useAuthStore((s) => s.activeInstance);
  // Prefer explicitly passed instanceId, else fall back to active instance
  const instanceId = routeInstanceId || activeInstance?.id;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `你好！我是 ${agentName}，有什么可以帮助你的吗？`,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const flatListRef = useRef<FlatList>(null);

  // Load chat history from openclaw instance on mount
  useEffect(() => {
    if (!instanceId) return;
    getAgentHistory(instanceId, undefined, 30).then((history) => {
      if (!history || history.length === 0) return;
      const mapped: Message[] = history.map((m) => ({
        id: m.id,
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
        timestamp: new Date(m.timestamp),
      }));
      setMessages(mapped);
    }).catch(() => {/* keep welcome message */});
  }, [instanceId]);

  const sendMessage = useCallback(async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      if (instanceId) {
        // Real OpenClaw instance — use proxy API
        const result = await sendAgentMessage(instanceId, userMessage.content, sessionId);
        if (result.sessionId) setSessionId(result.sessionId);
        const assistantMessage: Message = {
          id: result.reply.id || (Date.now() + 1).toString(),
          role: 'assistant',
          content: result.reply.content,
          timestamp: new Date(result.reply.timestamp),
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // No instance bound — show helpful prompt
        const noInstanceMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '⚠️ 请先在「Agent」页面绑定或部署一个 OpenClaw 实例，才能与 Agent 进行真实对话。\n\n点击首页 → 「+ 新建 Agent」开始设置。',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, noInstanceMsg]);
      }
    } catch (error: any) {
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `连接失败：${error?.message || '请检查你的 OpenClaw 实例是否在线，或刷新重试。'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, isLoading, instanceId, sessionId]);

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {!isUser && (
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>🤖</Text>
            </View>
          </View>
        )}
        <View style={[styles.messageContent, isUser ? styles.userContent : styles.assistantContent]}>
          <Text style={[styles.messageText, isUser && styles.userText]}>
            {item.content}
          </Text>
          <Text style={styles.timestamp}>
            {item.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />
        
        {isLoading && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.typingText}>{agentName} 正在输入...</Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="输入消息..."
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            <Text style={styles.sendButtonText}>发送</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  messageBubble: {
    flexDirection: 'row',
    marginBottom: 16,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
  },
  avatarContainer: {
    marginRight: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
  },
  messageContent: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '100%',
  },
  userContent: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  assistantContent: {
    backgroundColor: colors.cardBackground,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  timestamp: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'right',
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  typingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginLeft: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: 8,
    backgroundColor: colors.cardBackground,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: 10,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.textSecondary,
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
