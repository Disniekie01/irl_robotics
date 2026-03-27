import { RobotVisualizer } from "@/components/visualizer/RobotVisualizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Box } from "lucide-react";

export function VisualizerPage() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Box className="size-4 text-primary" />
            Live 3D Robot Visualizer
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Real-time 3D view of the SO-100 arm. Joint angles update at 10 Hz. Drag to orbit, scroll to zoom.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <RobotVisualizer className="h-[520px] w-full rounded-b-xl overflow-hidden" />
        </CardContent>
      </Card>
    </div>
  );
}
