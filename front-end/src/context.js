import { createContext, useContext } from "react";

// Shared things every page can use: the logged-in user, the backend helper,
// settings from the backend, and functions like navigate() and toast().
export const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}
