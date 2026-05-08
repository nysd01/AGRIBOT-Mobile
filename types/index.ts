export interface User {
  id: number;
  username: string;
  email: string;
  biometric_enrolled: boolean;
  created_at: string;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  biometricUserId: number | null;
  login(email: string, password: string): Promise<void>;
  signup(
    username: string,
    email: string,
    password: string,
    enrollBiometric: boolean
  ): Promise<void>;
  logout(): Promise<void>;
  biometricLogin(): Promise<void>;
}
