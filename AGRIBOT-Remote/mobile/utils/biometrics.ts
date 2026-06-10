import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_USER_ID_KEY = "biometric_user_id";

export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return false;
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return isEnrolled;
  } catch {
    return false;
  }
}

export async function authenticateWithBiometrics(
  action: string
): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: `Confirm your identity to ${action}`,
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });

    return result.success;
  } catch {
    return false;
  }
}

export async function saveBiometricSession(userId: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(BIOMETRIC_USER_ID_KEY, String(userId));
  } catch (error) {
    throw new Error(
      `Failed to save biometric session: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export async function getBiometricSession(): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(BIOMETRIC_USER_ID_KEY);
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
}

export async function clearBiometricSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_USER_ID_KEY);
  } catch (error) {
    throw new Error(
      `Failed to clear biometric session: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
