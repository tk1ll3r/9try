import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { chosenBook } from "./useLedger";

/** `/expenses/<book id>`: makes that book the open one, then shows the ledger. A book the person is not in changes nothing. */
export function OpenBookPage() {
  const { bookId = "" } = useParams();
  useEffect(() => { if (bookId) chosenBook.set(bookId); }, [bookId]);
  return <Navigate to="/expenses" replace />;
}
