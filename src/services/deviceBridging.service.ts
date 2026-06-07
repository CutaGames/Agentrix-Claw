import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import { File as ExpoFile } from 'expo-file-system';
import { Platform } from 'react-native';
// expo-image-picker is required lazily (inside pickImageAttachment) to avoid
// loading the ExponentImagePicker native module at JS bundle evaluation time,
// which crashes on HarmonyOS before the native bridge is fully initialised.

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
}

export interface ImageAttachment {
  uri: string;
  width: number | null;
  height: number | null;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
}

export interface FileAttachment {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number | null;
}

function inferMimeTypeFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeFromExt: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return mimeFromExt[ext] || 'application/octet-stream';
}

export class DeviceBridgingService {
  /**
   * Get current device location (GPS)
   */
  static async getCurrentLocation(): Promise<LocationData> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Location permission denied by user.');
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
      };
    } catch (error: any) {
      console.error('Failed to get location:', error);
      throw new Error(error.message || 'Failed to get location');
    }
  }

  /**
   * Read text from clipboard
   */
  static async readClipboard(): Promise<string> {
    try {
      const hasString = await Clipboard.hasStringAsync();
      if (!hasString) {
        return '';
      }
      const content = await Clipboard.getStringAsync();
      return content;
    } catch (error: any) {
      console.error('Failed to read clipboard:', error);
      throw new Error(error.message || 'Failed to read clipboard');
    }
  }

  /**
   * Write text to clipboard
   */
  static async writeClipboard(text: string): Promise<boolean> {
    try {
      await Clipboard.setStringAsync(text);
      return true;
    } catch (error: any) {
      console.error('Failed to write clipboard:', error);
      throw new Error(error.message || 'Failed to write clipboard');
    }
  }

  /**
   * Pick an image from the device's photo album without loading base64 into JS memory.
   */
  static async pickImageAttachment(): Promise<ImageAttachment | null> {
    try {
      const selected = await ExpoFile.pickFileAsync(undefined, 'image/*');
      const file = Array.isArray(selected) ? selected[0] : selected;

      if (file?.uri) {
        return {
          uri: file.uri,
          width: null,
          height: null,
          fileName: file.uri.split('/').pop() || 'image',
          mimeType: file.type || 'image/*',
          size: typeof file.size === 'number' ? file.size : null,
        };
      }

      return null;
    } catch (filePickerError: any) {
      const filePickerMessage = String(filePickerError?.message || '').toLowerCase();
      if (filePickerMessage.includes('cancel')) {
        return null;
      }

      try {
        // Lazy require: only load expo-image-picker native module when needed.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ImagePicker = require('expo-image-picker');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Photo album permission denied by user.');
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: false,
          quality: 0.8,
          base64: false,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
          const asset = result.assets[0];
          return {
            uri: asset.uri,
            width: asset.width ?? null,
            height: asset.height ?? null,
            fileName: asset.fileName ?? null,
            mimeType: asset.mimeType ?? null,
            size: asset.fileSize ?? null,
          };
        }

        return null;
      } catch (error: any) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('cancel')) {
          return null;
        }
        console.error('Failed to pick image:', error);
        throw new Error(error.message || 'Failed to pick image');
      }
    }
  }

  /**
   * Pick a general document/file from the device.
   */
  static async pickFileAttachment(): Promise<FileAttachment | null> {
    try {
      const selected = await ExpoFile.pickFileAsync();
      const file = Array.isArray(selected) ? selected[0] : selected;

      if (!file) {
        return null;
      }

      return {
        uri: file.uri,
        fileName: file.uri.split('/').pop() || 'attachment',
        mimeType: file.type || inferMimeTypeFromFileName(file.uri.split('/').pop() || 'attachment'),
        size: typeof file.size === 'number' ? file.size : null,
      };
    } catch (error: any) {
      if (String(error?.message || '').toLowerCase().includes('cancel')) {
        return null;
      }
      console.error('Failed to pick file:', error);
      throw new Error(error.message || 'Failed to pick file');
    }
  }

  /**
   * Take a photo using the device camera.
   * Falls back to album picker if camera is unavailable (e.g. HarmonyOS).
   */
  static async takeCameraPhoto(): Promise<ImageAttachment | null> {
    try {
      if (Platform.OS === 'android') {
        console.warn('Camera capture temporarily routed to album on Android to avoid native launcher crashes');
        return await DeviceBridgingService.pickImageAttachment();
      }

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ImagePicker = require('expo-image-picker');

      // Check if camera hardware is available before requesting permissions
      let cameraAvailable = true;
      try {
        const available = await ImagePicker.getCameraPermissionsAsync();
        const { status } = available.status === 'granted'
          ? available
          : await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Camera permission denied by user.');
        }
      } catch (permErr: any) {
        if (String(permErr?.message || '').toLowerCase().includes('permission denied')) {
          throw permErr;
        }
        // Permission check itself failed (no camera hardware, etc.)
        cameraAvailable = false;
      }

      if (cameraAvailable) {
        try {
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            quality: 0.8,
            base64: false,
            exif: false,
          });

          if (!result.canceled && result.assets && result.assets.length > 0) {
            const asset = result.assets[0];
            return {
              uri: asset.uri,
              width: asset.width ?? null,
              height: asset.height ?? null,
              fileName: asset.fileName ?? `photo-${Date.now()}.jpg`,
              mimeType: asset.mimeType ?? 'image/jpeg',
              size: asset.fileSize ?? null,
            };
          }

          return null;
        } catch (launchErr: any) {
          // Camera launch crashed — fall through to album fallback
          console.warn('Camera launch failed, falling back to album:', launchErr?.message);
        }
      }

      // Fallback: album picker when camera is unavailable or crashed
      console.warn('Camera unavailable — falling back to photo album');
      const { Alert } = require('react-native');
      Alert.alert(
        '📷',
        'Camera unavailable — opening photo album instead.',
        [{ text: 'OK' }],
      );
      return await DeviceBridgingService.pickImageAttachment();
    } catch (error: any) {
      if (String(error?.message || '').toLowerCase().includes('cancel')) {
        return null;
      }
      console.error('Failed to take camera photo:', error);
      throw new Error(error?.message || 'Failed to take camera photo');
    }
  }
}
