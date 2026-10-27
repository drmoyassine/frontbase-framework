export interface ComponentStyles {
  // Typography
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  lineHeight?: string;
  letterSpacing?: string;
  textAlign?: string;
  textColor?: string;
  
  // Layout & Spacing
  width?: string;
  height?: string;
  padding?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  margin?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  
  // Background & Border
  backgroundColor?: string;
  backgroundImage?: string;
  borderWidth?: string;
  borderColor?: string;
  borderRadius?: string;
  borderStyle?: string;
  
  // Layout
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  
  // Effects
  boxShadow?: string;
  opacity?: string;
  transform?: string;
  transition?: string;
}

export interface ResponsiveStyles {
  mobile?: ComponentStyles;
  tablet?: ComponentStyles;
  desktop?: ComponentStyles;
}

export interface ComponentWithStyles {
  id: string;
  type: string;
  props: Record<string, any>;
  styles?: ComponentStyles;
  responsiveStyles?: ResponsiveStyles;
  className?: string;
}

export type StyleMode = 'visual' | 'css';

export interface StylePreset {
  id: string;
  name: string;
  description?: string;
  styles: ComponentStyles;
  applicableTypes?: string[];
}