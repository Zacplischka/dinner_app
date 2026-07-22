// Zustand store for the Group Order (issue 2b). Mirrors authStore.ts — no
// `persist`: the ~4 KB Pinned Menu must never land in localStorage.

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MenuItemCapture, OrderState } from '@dinder/shared/types';

interface OrderStoreState {
  order: OrderState | null;
  menu: MenuItemCapture[];
  noMenuPlaceIds: string[];
  // menu only arrives on the order:open ack; order:state always omits it, so
  // an undefined argument keeps whatever menu is already in the store.
  setOrder: (order: OrderState, menu?: MenuItemCapture[]) => void;
  markNoMenu: (placeId: string) => void;
  clear: () => void;
}

const initialState = {
  order: null,
  menu: [],
  noMenuPlaceIds: [],
};

export const useOrderStore = create<OrderStoreState>()(
  devtools(
    (set) => ({
      ...initialState,

      setOrder: (order, menu) => set((state) => ({ order, menu: menu ?? state.menu })),

      markNoMenu: (placeId) =>
        set((state) =>
          state.noMenuPlaceIds.includes(placeId)
            ? state
            : { noMenuPlaceIds: [...state.noMenuPlaceIds, placeId] }
        ),

      clear: () => set(initialState),
    }),
    { name: 'OrderStore' }
  )
);
