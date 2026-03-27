"use client";

import placeholderSvg from "@/assets/placeholder.svg";
import { AutoComplete } from "@/components/common/autocomplete";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGlobalStore } from "@/lib/hooks";
import { fetchWithBaseUrl, fetcher } from "@/lib/utils";
import { Loader2, Search, TrafficCone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import useSWR, { mutate } from "swr";

type FieldValue = string | number | { value: string; label: string };
interface FormValues {
  [key: string]: FieldValue;
}
interface FormField {
  name: string;
  label: string;
  type: "ip" | "number" | "device_name" | "urdf_path" | "text" | "select";
  default?: string | number;
  options?: { value: string; label: string }[];
}
interface RobotType {
  id: string;
  name: string;
  category: "manipulator" | "mobile";
  image: string;
  note?: string;
  fields: FormField[];
}

const ROBOT_TYPES: RobotType[] = [
  {
    id: "irl_robotics",
    name: "Remote IRL Robotics server",
    category: "manipulator",
    image: placeholderSvg,
    note: "Connect to another IRL Robotics server running on your network. Use WebSocket mode for low-latency leader-follower control.",
    fields: [
      { name: "ip", label: "IP Address", type: "ip" },
      { name: "port", label: "Port", type: "number", default: 80 },
      { name: "robot_id", label: "Robot ID", type: "number", default: 0 },
      {
        name: "mode",
        label: "Transport Mode",
        type: "select",
        default: "http",
        options: [
          { value: "http", label: "HTTP (default)" },
          { value: "ws", label: "WebSocket (low-latency)" },
        ],
      },
    ],
  },
  {
    id: "unitree-d1",
    name: "Unitree D1 Arm",
    category: "manipulator",
    image: placeholderSvg,
    note: "Requires cyclonedds for DDS communication. Install with: pip install cyclonedds==0.10.2. The D1 arm must be on the same Ethernet network (default IP: 192.168.123.100).",
    fields: [
      { name: "ip", label: "IP Address", type: "ip" },
      { name: "network_interface", label: "Network Interface (optional)", type: "text" },
    ],
  },
  {
    id: "unitree-go2",
    name: "Unitree Go2",
    category: "mobile",
    image: placeholderSvg,
    note: "Connect via WebRTC over Wi-Fi. The Go2 must be on the same local network. Requires the go2-webrtc-connect package (pre-installed).",
    fields: [{ name: "ip", label: "IP Address", type: "ip" }],
  },
  {
    id: "so-100",
    name: "SO-100 / SO-101",
    category: "manipulator",
    image: placeholderSvg,
    note: "Connect via USB using the Feetech serial adapter (CH340 chip). Plug in the robot and select the USB port. Requires feetech-servo-sdk (pre-installed).",
    fields: [{ name: "device_name", label: "USB Port", type: "device_name" }],
  },
  {
    id: "koch-v1.1",
    name: "Koch 1.1",
    category: "manipulator",
    image: placeholderSvg,
    note: "Connect via USB using the Dynamixel U2D2 adapter. Plug in the robot and select the USB port. Requires dynamixel-sdk (pre-installed).",
    fields: [{ name: "device_name", label: "USB Port", type: "device_name" }],
  },
  {
    id: "lekiwi",
    name: "LeKiwi",
    category: "mobile",
    image: placeholderSvg,
    note: "Connect over the network via ZMQ. The LeKiwi must be running its server and reachable at the given IP and port.",
    fields: [
      { name: "ip", label: "IP Address", type: "ip" },
      { name: "port", label: "Port", type: "number", default: 5555 },
    ],
  },
  {
    id: "urdf_loader",
    name: "URDF loader",
    category: "manipulator",
    image: placeholderSvg,
    note: "Load any robot from a URDF file. Provide the path to the URDF on the server, the end effector and gripper joint indices. Optionally enable ZMQ for external joint state streaming.",
    fields: [
      { name: "urdf_path", label: "URDF Path", type: "urdf_path" },
      {
        name: "end_effector_link_index",
        label: "End Effector Link Index",
        type: "number",
      },
      {
        name: "gripper_joint_index",
        label: "Gripper Joint Index",
        type: "number",
      },
      {
        name: "zmq_server_url",
        label: "ZMQ Server URL",
        type: "text",
        default: "tcp://localhost:5555",
      },
      {
        name: "zmq_topic",
        label: "ZMQ Topic",
        type: "text",
        default: "excavator_state",
      },
    ],
  },
];

interface RobotConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
interface NetworkDevice {
  ip: string;
  mac: string;
}
interface NetworkReponse {
  devices: NetworkDevice[];
}
interface LocalDevice {
  name: string;
  device: string;
  serial_number?: string;
  pid?: number;
  interface?: string;
}
interface LocalResponse {
  devices: LocalDevice[];
}

// --- Component ---
export function RobotConfigModal({
  open,
  onOpenChange,
}: RobotConfigModalProps) {
  const [selectedRobotType, setSelectedRobotType] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formValues, setFormValues] = useState<FormValues>({});

  const {
    urdfPath,
    setUrdfPath,
    urdfPathHistory,
    addUrdfPathToHistory,
    endEffectorLinkIndex,
    setEndEffectorLinkIndex,
    gripperJointIndex,
    setGripperJointIndex,
    zmqServerUrl,
    setZmqServerUrl,
    zmqTopic,
    setZmqTopic,
    urdfUseZmq,
    setUrdfUseZmq,
  } = useGlobalStore();

  const selectedRobot = ROBOT_TYPES.find(
    (robot) => robot.id === selectedRobotType,
  );

  const [networkScanRequested, setNetworkScanRequested] = useState(false);

  const { data: networkDevices, isLoading: isLoadingDevices } =
    useSWR<NetworkReponse>(
      networkScanRequested ? ["/network/scan-devices"] : null,
      ([endpoint]) => fetcher(endpoint, "POST"),
    );

  const { data: usbPorts, isLoading: isLoadingUsb } = useSWR<LocalResponse>(
    ["/local/scan-devices"],
    ([endpoint]) => fetcher(endpoint, "POST"),
  );

  const handleRobotTypeChange = (value: string) => {
    setSelectedRobotType(value);
    const robot = ROBOT_TYPES.find((r) => r.id === value);

    if (robot) {
      const defaultValues = robot.fields.reduce((acc, field) => {
        if (field.name === "urdf_path") acc[field.name] = urdfPath;
        else if (field.name === "end_effector_link_index")
          acc[field.name] = endEffectorLinkIndex;
        else if (field.name === "gripper_joint_index")
          acc[field.name] = gripperJointIndex;
        else if (field.name === "zmq_server_url")
          acc[field.name] = zmqServerUrl;
        else if (field.name === "zmq_topic") acc[field.name] = zmqTopic;
        else if (field.default !== undefined) {
          acc[field.name] = field.default;
        }
        return acc;
      }, {} as FormValues);
      setFormValues(defaultValues);
    } else {
      setFormValues({});
    }
  };

  const handleFieldChange = (fieldName: string, value: FieldValue) => {
    setFormValues((prev) => ({
      ...prev,
      [fieldName]: value,
    }));

    const valueToStore = typeof value === "object" ? value.value : value;
    switch (fieldName) {
      case "end_effector_link_index":
        setEndEffectorLinkIndex(parseInt(String(valueToStore)) || 1);
        break;
      case "gripper_joint_index":
        setGripperJointIndex(parseInt(String(valueToStore)) || 1);
        break;
      case "zmq_server_url":
        setZmqServerUrl(String(valueToStore));
        break;
      case "zmq_topic":
        setZmqTopic(String(valueToStore));
        break;
    }
  };

  const handleSubmit = async () => {
    if (!selectedRobot) return;

    // Adjust required fields based on the ZMQ checkbox state
    let requiredFields = selectedRobot.fields;
    if (selectedRobot.id === "urdf_loader" && !urdfUseZmq) {
      requiredFields = selectedRobot.fields.filter(
        (f) => !f.name.startsWith("zmq"),
      );
    }

    const missingFields = requiredFields.filter(
      (field) =>
        formValues[field.name] === undefined && field.default === undefined,
    );

    if (missingFields.length > 0) {
      toast.error(
        `Please fill in all required fields: ${missingFields.map((f) => f.label).join(", ")}`,
      );
      return;
    }
    setIsSubmitting(true);

    const connectionDetails = requiredFields.reduce(
      (acc, field) => {
        const formValue = formValues[field.name];
        const fieldValue = formValue !== undefined ? formValue : field.default;

        if (fieldValue !== undefined) {
          acc[field.name] =
            typeof fieldValue === "object" && "value" in fieldValue
              ? fieldValue.value
              : fieldValue;
        }
        return acc;
      },
      {} as Record<string, string | number | null>, // Allow null
    );

    // If URDF loader and ZMQ is disabled, explicitly set fields to null
    if (selectedRobot.id === "urdf_loader" && !urdfUseZmq) {
      connectionDetails.zmq_server_url = null;
      connectionDetails.zmq_topic = null;
    }

    try {
      const payload = {
        robot_name: selectedRobotType,
        connection_details: connectionDetails,
      };

      const response = await fetchWithBaseUrl(
        "/robot/add-connection",
        "POST",
        payload,
      );

      if (response) {
        toast.success(
          `${selectedRobot.name} robot has been added successfully.`,
        );

        if (selectedRobotType === "urdf_loader" && urdfPath) {
          addUrdfPathToHistory(urdfPath);
        }

        onOpenChange(false);
        setSelectedRobotType("");
        setFormValues({});
        mutate("/status");
      }
    } catch (error) {
      console.error("Error adding robot:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Separate fields for conditional rendering
  const isUrdfLoader = selectedRobot?.id === "urdf_loader";
  const regularFields = isUrdfLoader
    ? selectedRobot.fields.filter((f) => !f.name.startsWith("zmq"))
    : selectedRobot?.fields || [];
  const zmqFields = isUrdfLoader
    ? selectedRobot.fields.filter((f) => f.name.startsWith("zmq"))
    : [];

  const renderField = (field: FormField) => (
    <div key={field.name} className="space-y-2">
      <Label htmlFor={field.name}>{field.label}</Label>
      {field.type === "ip" && (
        <div className="flex gap-2">
          <div className="flex-1">
            <AutoComplete
              options={
                networkDevices?.devices.map((device) => ({
                  value: device.ip,
                  label: `${device.ip} (${device.mac})`,
                })) || []
              }
              value={
                formValues[field.name] as
                  | { value: string; label: string }
                  | undefined
              }
              onValueChange={(value) => handleFieldChange(field.name, value)}
              isLoading={isLoadingDevices}
              placeholder="Select or enter IP address"
              emptyMessage="No IP addresses found"
              allowCustomValue={true}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setNetworkScanRequested(true)}
            disabled={isLoadingDevices}
            title="Scan network for devices"
          >
            {isLoadingDevices ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
      {field.type === "device_name" && (
        <AutoComplete
          options={
            usbPorts?.devices.map((device) => {
              let label = `${device.device}`;
              if (device.serial_number) label += ` (${device.serial_number}`;
              if (device.pid) label += ` | ${device.pid}`;
              if (label.includes("(")) label += ")";
              return { value: device.device, label: label };
            }) || []
          }
          value={
            formValues[field.name] as
              | { value: string; label: string }
              | undefined
          }
          onValueChange={(value) => handleFieldChange(field.name, value)}
          isLoading={isLoadingUsb}
          placeholder="Select USB port"
          emptyMessage="No USB ports detected"
          allowCustomValue={true}
        />
      )}
      {field.type === "urdf_path" && (
        <AutoComplete
          options={urdfPathHistory.map((path) => ({
            value: path,
            label: path,
          }))}
          value={urdfPath ? { value: urdfPath, label: urdfPath } : undefined}
          onValueChange={(option) => {
            const path = option.value;
            setUrdfPath(path);
            handleFieldChange(field.name, path);
          }}
          placeholder="Enter or select URDF path"
          emptyMessage="No recent URDF paths"
          allowCustomValue={true}
        />
      )}
      {field.type === "select" && field.options && (
        <Select
          value={String(formValues[field.name] ?? field.default ?? "")}
          onValueChange={(value) => handleFieldChange(field.name, value)}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Select ${field.label}`} />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {(field.type === "number" || field.type === "text") && (
        <Input
          id={field.name}
          type={field.type}
          placeholder={
            field.default !== undefined
              ? `Default: ${field.default}`
              : `Enter ${field.label}`
          }
          value={String(formValues[field.name] ?? "")}
          onChange={(e) => handleFieldChange(field.name, e.target.value)}
        />
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Connect to another robot</DialogTitle>
          <DialogDescription className="flex flex-col gap-y-2">
            <div>
              Manually connect to a robot by selecting its type and entering the
              connection details.
            </div>
            <div className="border border-destructive bg-destructive/10 text-destructive rounded-md p-2">
              <TrafficCone className="inline mr-2 size-6" />
              Experimental feature.
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-2">
          {/* Robot Type Selector */}
          <div className="grid grid-cols-[2fr_1fr] items-start gap-4">
            {/* ... (unchanged) ... */}
            <div className="space-y-2">
              <Label htmlFor="robot-type">Robot Type</Label>
              <Select
                value={selectedRobotType}
                onValueChange={handleRobotTypeChange}
              >
                <SelectTrigger id="robot-type">
                  <SelectValue placeholder="Select robot type" />
                </SelectTrigger>
                <SelectContent>
                  {ROBOT_TYPES.map((robot) => (
                    <SelectItem key={robot.id} value={robot.id}>
                      {robot.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedRobot && (
              <div className="flex flex-col items-center justify-center">
                <div className="relative h-[120px] w-[120px] rounded-md border overflow-hidden">
                  <img
                    src={selectedRobot.image || "/placeholder.svg"}
                    alt={selectedRobot.name}
                    className="object-cover w-[120px] h-[120px]"
                  />
                </div>
                <span className="text-xs text-muted-foreground mt-1">
                  {selectedRobot.category === "mobile"
                    ? "Mobile Unit"
                    : "Manipulator"}
                </span>
              </div>
            )}
          </div>

          {/* Dynamic Form Fields */}
          {selectedRobot && (
            <div className="space-y-4">
              {selectedRobot.note && (
                <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-700 dark:text-yellow-400">
                  {selectedRobot.note}
                </div>
              )}
              {/* Render regular fields */}
              {regularFields.map(renderField)}

              {/* Conditionally render ZMQ fields for URDF Loader */}
              {isUrdfLoader && (
                <div className="space-y-4 rounded-md border bg-muted/50 p-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="use-zmq"
                      checked={urdfUseZmq}
                      onCheckedChange={(checked) => setUrdfUseZmq(!!checked)}
                    />
                    <Label
                      htmlFor="use-zmq"
                      className="font-semibold leading-none"
                    >
                      Use ZMQ Subscriber
                    </Label>
                  </div>
                  {urdfUseZmq && zmqFields.map(renderField)}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedRobot || isSubmitting}
            className="min-w-[120px]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Add Robot"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
