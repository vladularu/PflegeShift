import { SQLiteProvider } from "expo-sqlite";
import {
  Component,
  useCallback,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PRODUCT_NAME } from "@/brand";
import {
  initializeSecureDatabase,
  prepareSecureDatabase,
  SECURE_DATABASE_NAME,
} from "@/infrastructure/database/secure-database.native";
import { databaseSecurityMessage } from "@/infrastructure/database/database-security-error";

type BootstrapState =
  { status: "loading" } | { status: "ready" } | { status: "error"; message: string };

function safeErrorMessage(error: unknown): string {
  return databaseSecurityMessage(error);
}

interface DatabaseFailureViewProps {
  message: string;
  onRetry: () => void;
}

function DatabaseFailureView({ message, onRetry }: DatabaseFailureViewProps) {
  return (
    <View accessibilityRole="alert" style={styles.centered}>
      <Text accessibilityRole="header" style={styles.title}>
        Datenbank nicht verfügbar
      </Text>
      <Text style={styles.body}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Erneut versuchen</Text>
      </Pressable>
    </View>
  );
}

interface DatabaseErrorBoundaryProps {
  children: ReactNode;
  onRetry: () => void;
}

interface DatabaseErrorBoundaryState {
  message: string | null;
}

class DatabaseErrorBoundary extends Component<
  DatabaseErrorBoundaryProps,
  DatabaseErrorBoundaryState
> {
  state: DatabaseErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): DatabaseErrorBoundaryState {
    return { message: safeErrorMessage(error) };
  }

  private retry = () => {
    this.setState({ message: null });
    this.props.onRetry();
  };

  render() {
    if (this.state.message !== null) {
      return <DatabaseFailureView message={this.state.message} onRetry={this.retry} />;
    }
    return this.props.children;
  }
}

export function SecureDatabaseProvider({ children }: PropsWithChildren) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    prepareSecureDatabase().then(
      () => {
        if (active) setState({ status: "ready" });
      },
      (error: unknown) => {
        if (active) setState({ status: "error", message: safeErrorMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (state.status === "loading") {
    return (
      <View accessibilityRole="progressbar" style={styles.centered}>
        <Text accessibilityRole="header" style={styles.title}>
          Sichere Datenbank wird vorbereitet
        </Text>
        <Text style={styles.body}>{PRODUCT_NAME} schützt deine lokalen Daten.</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return <DatabaseFailureView message={state.message} onRetry={retry} />;
  }

  return (
    <DatabaseErrorBoundary key={attempt} onRetry={retry}>
      <SQLiteProvider databaseName={SECURE_DATABASE_NAME} onInit={initializeSecureDatabase}>
        {children}
      </SQLiteProvider>
    </DatabaseErrorBoundary>
  );
}

const styles = StyleSheet.create({
  body: {
    color: "#40504A",
    fontSize: 16,
    lineHeight: 23,
    maxWidth: 340,
    textAlign: "center",
  },
  button: {
    alignItems: "center",
    backgroundColor: "#146C53",
    borderRadius: 12,
    minHeight: 48,
    justifyContent: "center",
    marginTop: 8,
    paddingHorizontal: 20,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  centered: {
    alignItems: "center",
    backgroundColor: "#F5F7F6",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#17211E",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
  },
});
