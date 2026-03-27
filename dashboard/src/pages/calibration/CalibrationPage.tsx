import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalibrationSequence } from "@/pages/calibration/calibration-sequence";
import { JointControl } from "@/pages/calibration/joint-control";
import { MotorSetup } from "@/pages/calibration/motor-setup";

export function CalibrationPage() {
  return (
    <Tabs defaultValue="setup">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="setup">Setup</TabsTrigger>
        <TabsTrigger value="calibrate">Calibration</TabsTrigger>
        <TabsTrigger value="joint-control">Joints control</TabsTrigger>
      </TabsList>
      <TabsContent value="setup">
        <MotorSetup />
      </TabsContent>
      <TabsContent value="calibrate">
        <CalibrationSequence />
      </TabsContent>
      <TabsContent value="joint-control">
        <JointControl />
      </TabsContent>
    </Tabs>
  );
}
