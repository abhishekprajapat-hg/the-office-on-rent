import React from "react";
import { SchematicMap } from "./SchematicMap";
import type { FieldMapProps } from "./types";

/* react-native-maps has no web build; the browser preview draws the schematic map. */
export const FieldMap = (props: FieldMapProps) => <SchematicMap {...props} />;
