import { Link } from "react-router-dom";
import { ArrowRight, Shirt, Wrench, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { categoryLabel, CATEGORIES } from "@/lib/constants";
import type { RequestCategory } from "@/lib/types";

const ICONS: Record<RequestCategory, typeof Package> = {
  insumos: Package,
  indumentaria: Shirt,
  maquinaria: Wrench,
};

const NewRequestPage = () => (
  <div className="space-y-4">
    <div>
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Nuevo pedido</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Elegí qué tipo de solicitud vas a cargar. Los campos del formulario cambian según la
        categoría.
      </p>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORIES.map((category) => {
        const Icon = ICONS[category.value];
        return (
          <Link key={category.value} to={`/nuevo/${category.value}`} className="group">
            <Card className="h-full shadow-card transition-colors group-hover:border-primary/40">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="font-semibold text-foreground">{categoryLabel(category.value)}</p>
                  <p className="text-sm text-muted-foreground">{category.hint}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Empezar <ArrowRight className="h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  </div>
);

export default NewRequestPage;
