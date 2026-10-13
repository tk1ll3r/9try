import { Bus, House, PartyPopper, Receipt, ShoppingBag, Utensils } from "lucide-react";

const icons: Record<string, typeof Receipt> = { food: Utensils, transport: Bus, shopping: ShoppingBag, fun: PartyPopper, home: House };
/** The icon of a category by its key. A key this version does not know gets the general one. */
export const categoryIcon = (key: string | undefined) => icons[key ?? ""] ?? Receipt;
