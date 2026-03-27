import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useLocalStorageState } from "@/lib/hooks";
import { fetchWithBaseUrl, fetcher } from "@/lib/utils";
import { TeleopSettings } from "@/types";
import { useCallback, useRef } from "react";
import useSWR from "swr";

export function VRControl() {

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [accordionOpen, setAccordionOpen] = useLocalStorageState(
    "vr-how-to-connect-accordion",
    "",
  );

  // Logarithmic scaling functions for the slider
  // Map linear slider position (0-100) to logarithmic scaling value (0.1-3.0)
  const sliderToScaling = (sliderValue: number): number => {
    // Map 0-50 to 0.1-1.0 and 50-100 to 1.0-3.0 logarithmically
    if (sliderValue <= 50) {
      // Lower half: 0.1 to 1.0
      const normalizedValue = sliderValue / 50; // 0 to 1
      return 0.1 * Math.pow(10, normalizedValue); // 0.1 to 1.0 logarithmically
    } else {
      // Upper half: 1.0 to 3.0
      const normalizedValue = (sliderValue - 50) / 50; // 0 to 1
      return 1.0 * Math.pow(3, normalizedValue); // 1.0 to 3.0 logarithmically
    }
  };

  // Map scaling value (0.1-3.0) to linear slider position (0-100)
  const scalingToSlider = (scalingValue: number): number => {
    if (scalingValue <= 1.0) {
      // Lower half: map 0.1-1.0 to 0-50
      const logValue = Math.log10(scalingValue / 0.1); // 0 to 1
      return logValue * 50; // 0 to 50
    } else {
      // Upper half: map 1.0-3.0 to 50-100
      const logValue = Math.log(scalingValue / 1.0) / Math.log(3); // 0 to 1
      return 50 + logValue * 50; // 50 to 100
    }
  };

  const { data: settings, mutate: mutateSettings } = useSWR<TeleopSettings>(
    ["/teleop/settings/read"],
    ([url]) => fetcher(url, "POST"),
    {
      fallbackData: { vr_scaling: 1.0 },
      revalidateOnFocus: false,
    },
  );

  const updateTeleopSetting = useCallback(
    async <K extends keyof TeleopSettings>(
      key: K,
      value: TeleopSettings[K],
    ) => {
      if (!settings) return;

      const updatedSettings = { ...settings, [key]: value };

      // Optimistic update
      await mutateSettings(updatedSettings, false);

      // Debounced server sync
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(async () => {
        const updatePayload = { [key]: value } as Partial<TeleopSettings>;
        await fetchWithBaseUrl("/teleop/settings", "POST", updatePayload);
        // Revalidate to ensure sync with server
        mutateSettings();
      }, 150);
    },
    [settings, mutateSettings],
  );

  const handleScalingChange = (value: number[]) => {
    const sliderValue = value[0];
    const scalingValue = sliderToScaling(sliderValue);
    updateTeleopSetting("vr_scaling", scalingValue);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>VR Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* How to Connect Accordion */}
          <Accordion
            type="single"
            collapsible
            value={accordionOpen}
            onValueChange={setAccordionOpen}
          >
            <AccordionItem value="how-to-connect">
              <AccordionTrigger>
                How to connect to your robot in VR?
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Control your robot using hand tracking from an Apple Vision
                    Pro or any WebXR-compatible headset. The VR client runs in
                    your headset's browser and connects to this server via
                    WebSocket.
                  </p>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Quick Start</h4>
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>
                        Start the VR client server on your machine:
                        <code className="ml-1 px-1.5 py-0.5 bg-muted rounded text-xs">
                          node vr-client/serve.js
                        </code>
                      </li>
                      <li>
                        Open{" "}
                        <code className="px-1.5 py-0.5 bg-muted rounded text-xs">
                          http://{"<your-ip>"}:8443
                        </code>{" "}
                        in your headset's browser (Safari on Vision Pro, Meta
                        Quest Browser, etc.)
                      </li>
                      <li>
                        Set the Server URL to your IRL Robotics server address
                        (e.g.{" "}
                        <code className="px-1.5 py-0.5 bg-muted rounded text-xs">
                          ws://192.168.1.54:80/move/teleop/ws
                        </code>
                        )
                      </li>
                      <li>
                        Tap <strong>Enter VR/AR Mode</strong> and start moving
                        your hands
                      </li>
                    </ol>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Controls</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>
                        <strong>Hand tracking</strong> — move your hands to
                        control robot position and orientation
                      </li>
                      <li>
                        <strong>Pinch gesture</strong> (thumb + index finger) —
                        close/open the gripper
                      </li>
                      <li>
                        <strong>First frame</strong> after entering VR
                        calibrates the hand origin position
                      </li>
                      <li>
                        Press <strong>R</strong> on a connected keyboard to
                        recalibrate
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Supported Headsets</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                      <li>Apple Vision Pro (Safari — immersive-ar mode)</li>
                      <li>Meta Quest 2 / Pro / 3 / 3S (Quest Browser — immersive-vr mode)</li>
                      <li>Any WebXR-capable browser with hand tracking support</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border p-3 bg-muted/50 text-sm text-muted-foreground">
                    <strong>Note:</strong> WebXR requires HTTPS in production.
                    For local development, <code>localhost</code> works without
                    HTTPS. For network access from a headset, use a tool like{" "}
                    <code>mkcert</code> to generate local SSL certificates.
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {/* Settings Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-base">Settings</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="scaling-slider">
                  Sensitivity: {settings?.vr_scaling.toFixed(1) ?? "1.0"}
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground cursor-help">
                        ⓘ
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>
                        <strong>Default</strong>: 1.0 (real-life scale)
                        <br />
                        <strong>Low values</strong>: Robot barely moves when you
                        move a lot
                        <br />
                        <strong>High values</strong>: Robot moves a lot when you
                        move a little
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Slider
                id="scaling-slider"
                min={0}
                max={100}
                step={1}
                value={[scalingToSlider(settings?.vr_scaling ?? 1.0)]}
                onValueChange={handleScalingChange}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>0.1</span>
                <span className="font-medium">1.0</span>
                <span>3.0</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
