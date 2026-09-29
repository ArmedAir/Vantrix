# Keep Capacitor's JS bridge + plugin classes: they are looked up by reflection.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { @com.getcapacitor.annotation.PluginMethod public <methods>; }
-keep class com.google.firebase.** { *; }
-keepattributes *Annotation*, SourceFile, LineNumberTable
