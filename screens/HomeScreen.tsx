import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useAuth } from "@/context/AuthContext";

export default function HomeScreen() {
  const { user, logout, isLoading } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome, {user?.username ?? "User"}</Text>
      <Text style={styles.subtitle}>You are logged in locally.</Text>

      <TouchableOpacity style={styles.button} onPress={() => void logout()}>
        <Text style={styles.buttonText}>Logout</Text>
      </TouchableOpacity>

      {isLoading ? <ActivityIndicator style={styles.loader} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    backgroundColor: "#F5F7FA",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
    color: "#0F172A",
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    color: "#334155",
  },
  button: {
    backgroundColor: "#0F172A",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  loader: {
    marginTop: 24,
  },
});
