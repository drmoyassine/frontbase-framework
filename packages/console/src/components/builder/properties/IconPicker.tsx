import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandInput, CommandList } from '@/components/ui/command';
import { ChevronsUpDown, Search, X as XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

// Import specific icons we want to show (expanded list ~200+ icons)
import {
  // A
  Activity, Airplay, AlarmClock, AlertCircle, AlertOctagon, AlertTriangle, AlignCenter, AlignJustify, AlignLeft, AlignRight,
  Anchor, Aperture, Archive, ArrowBigDown, ArrowBigLeft, ArrowBigRight, ArrowBigUp, ArrowDown, ArrowDownCircle, ArrowDownLeft,
  ArrowDownRight, ArrowLeft, ArrowLeftCircle, ArrowRight, ArrowRightCircle, ArrowUp, ArrowUpCircle, ArrowUpDown, ArrowUpLeft,
  ArrowUpRight, AtSign, Award,
  // B
  Baby, BadgeCheck, BadgeDollarSign, BadgePercent, Ban, Banknote, BarChart, BarChart2, BarChart3, Battery,
  BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Beaker, Bell, BellOff, BellRing, Bike, Binary,
  Bitcoin, Blend, Blocks, Bluetooth, Bold, Bomb, Bone, Book, BookOpen, Bookmark,
  Bot, Box, Boxes, Brain, Briefcase, Brush, Bug, Building, Building2, Bus,
  // C
  Cake, Calculator, Calendar, Camera, CameraOff, Car, Castle, Cat, CheckCheck, Check,
  CheckCircle, CheckCircle2, CheckSquare, ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ChevronUp, ChevronsDown,
  ChevronsLeft, ChevronsRight, ChevronsUp, Chrome, Circle, CircleDot, CircleOff, Clapperboard, Clipboard, ClipboardCheck,
  ClipboardCopy, ClipboardList, Clock, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudOff, CloudRain, CloudSnow,
  CloudSun, Clover, Code, Code2, Codepen, Codesandbox, Coffee, Cog, Coins, Columns,
  Command as CommandIcon, Compass, Component, Contrast, Cookie, Copy, CopyCheck, Copyright, CornerDownLeft, CornerDownRight,
  CornerLeftDown, CornerLeftUp, CornerRightDown, CornerRightUp, CornerUpLeft, CornerUpRight, Cpu, CreditCard, Croissant, Crop,
  Crown, CupSoda,
  // D
  Database, Delete, Diamond, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Dices,
  Disc, Divide, DivideCircle, DivideSquare, Dog, DollarSign, Donut, DoorClosed, DoorOpen, Download,
  DownloadCloud, Dribbble, Droplet, Droplets, Drum, Drumstick, Dumbbell,
  // E
  Ear, EarOff, Edit, Edit2, Edit3, Egg, Equal, EqualNot, Eraser, Euro,
  Expand, ExternalLink, Eye, EyeOff,
  // F
  Facebook, Factory, Fan, FastForward, Feather, Figma, File, FileArchive, FileAudio, FileAxis3d,
  FileBarChart, FileBox, FileCheck, FileCode, FileCog, FileDiff, FileDigit, FileDown, FileEdit, FileHeart,
  FileImage, FileInput, FileJson, FileKey, FileLock, FileMinus, FileOutput, FilePlus, FileQuestion, FileScan,
  FileSearch, FileSpreadsheet, FileSymlink, FileTerminal, FileText, FileType, FileUp, FileVideo, FileVolume, FileWarning,
  FileX, Files, Film, Filter, Fingerprint, Flag, FlagOff, Flame, Flashlight,
  FlaskConical, FlaskRound, FlipHorizontal, FlipVertical, Flower, Flower2, Focus, Folder, FolderArchive, FolderCheck,
  FolderClock, FolderCog, FolderDown, FolderEdit, FolderHeart, FolderInput, FolderKey, FolderLock, FolderMinus, FolderOpen,
  FolderOutput, FolderPlus, FolderSearch, FolderSymlink, FolderTree, FolderUp, FolderX, Folders, Footprints, Forklift,
  FormInput, Forward, Frame, Framer, Frown,
  // G
  Gamepad, Gamepad2, Gauge, Gavel, Gem, Ghost, Gift, GitBranch, GitCommit, GitCompare,
  GitFork, GitMerge, GitPullRequest, Github, Gitlab, GlassWater, Glasses, Globe, Globe2, Goal,
  Grab, GraduationCap, Grape, Grid,
  // H
  Hammer, Hand, HandMetal, HardDrive, HardHat, Hash, Haze, Heading, Heading1, Heading2,
  Heading3, Heading4, Heading5, Heading6, Headphones, Heart, HeartCrack, HeartHandshake, HeartOff, HeartPulse,
  HelpCircle, Hexagon, Highlighter, History, Home, Hotel, Hourglass,
  // I-L
  IceCream, Image, ImageMinus, ImageOff, ImagePlus, Import, Inbox, Indent, IndianRupee, Infinity,
  Info, Inspect, Instagram, Italic, JapaneseYen, Joystick, Key, Keyboard, Lamp, LampCeiling,
  LampDesk, LampFloor, LampWallDown, LampWallUp, Landmark, Languages, Laptop, Laptop2, Lasso, LassoSelect,
  Laugh, Layers, Layout, LayoutDashboard, LayoutGrid, LayoutList, LayoutTemplate, Leaf, LeafyGreen, Library,
  LifeBuoy, Lightbulb, LightbulbOff, LineChart, Link, Link2, Link2Off, Linkedin, List, ListChecks,
  ListEnd, ListMinus, ListMusic, ListOrdered, ListPlus, ListStart, ListTree, ListVideo, ListX, Loader,
  Loader2, Locate, LocateFixed, LocateOff, Lock, LogIn, LogOut,
  // M
  Magnet, Mail, MailCheck, MailMinus, MailOpen, MailPlus, MailQuestion, MailSearch, MailWarning, MailX,
  Mailbox, Map, MapPin, MapPinOff, Maximize, Maximize2, Medal, Megaphone, Meh, Menu,
  MessageCircle, MessageSquare, Mic, Mic2, MicOff, Microscope, Microwave, Milestone, Milk, Minimize,
  Minimize2, Minus, MinusCircle, MinusSquare, Monitor, MonitorOff, MonitorSpeaker, Moon, MoreHorizontal, MoreVertical,
  Mountain, MountainSnow, Mouse, MousePointer, MousePointer2, MousePointerClick, Move, Move3d, MoveDown, MoveDownLeft,
  MoveDownRight, MoveHorizontal, MoveLeft, MoveRight, MoveUp, MoveUpLeft, MoveUpRight, MoveVertical, Music, Music2,
  Music3, Music4,
  // N-P
  Navigation, Navigation2, Network, Newspaper, Nut, Octagon, Option, Orbit, Outdent, Package,
  Package2, PackageCheck, PackageMinus, PackageOpen, PackagePlus, PackageSearch, PackageX, PaintBucket, Paintbrush, Paintbrush2,
  Palette, Palmtree, PanelBottom, PanelLeft, PanelRight, PanelTop, Paperclip, Parentheses, ParkingCircle, ParkingCircleOff,
  ParkingSquare, ParkingSquareOff, PartyPopper, Pause, PauseCircle, PauseOctagon, PenTool, Pencil, Pentagon, Percent,
  PersonStanding, Phone, PhoneCall, PhoneForwarded, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Pi, PieChart,
  PiggyBank, Pin, PinOff, Pipette, Pizza, Plane, Play, PlayCircle, Plug, Plug2,
  PlugZap, Plus, PlusCircle, PlusSquare, Pocket, Podcast, Pointer, PoundSterling, Power, PowerOff,
  Presentation, Printer, Puzzle,
  // Q-R
  QrCode, Quote, Radar, Radiation, Radio, RadioReceiver, RectangleHorizontal, RectangleVertical, Recycle, Redo,
  Redo2, RefreshCcw, RefreshCw, Refrigerator, Regex, RemoveFormatting, Repeat, Repeat1, Reply, ReplyAll,
  Rewind, Rocket, RockingChair, RotateCcw, RotateCw, Router, Rows, Rss, Ruler, RussianRuble,
  // S
  Sailboat, Save, Scale, Scale3d, Scaling, Scan, ScanFace, ScanLine, Scissors, ScreenShare,
  ScreenShareOff, Scroll, ScrollText, Search as SearchIconBase, SearchCheck, SearchCode, SearchSlash, SearchX, Send, SendHorizontal,
  SendToBack, SeparatorHorizontal, SeparatorVertical, Server, ServerCog, ServerCrash, ServerOff, Settings, Settings2, Share,
  Share2, Sheet, Shield, ShieldAlert, ShieldCheck, ShieldClose, ShieldOff, ShieldQuestion, Ship, Shirt,
  ShoppingBag, ShoppingCart, Shovel, ShowerHead, Shrink, Shrub, Shuffle, Sigma, Signal, SignalHigh,
  SignalLow, SignalMedium, SignalZero, Siren, SkipBack, SkipForward, Skull, Slack, Slash, Slice,
  Sliders, SlidersHorizontal, Smartphone, SmartphoneCharging, Smile, SmilePlus, Snail, Snowflake, Sofa, SortAsc,
  SortDesc, Soup, Space, Sparkle, Sparkles, Speaker, Spline, Split, SplitSquareHorizontal, SplitSquareVertical,
  Sprout, Square, SquareAsterisk, Squirrel, Stamp, Star, StarHalf, StarOff, StepBack, StepForward,
  Stethoscope, Sticker, StickyNote, StopCircle, Store, StretchHorizontal, StretchVertical, Strikethrough, Subscript, Sun,
  SunDim, SunMedium, SunSnow, Sunrise, Sunset, Superscript, SwissFranc, SwitchCamera, Sword, Swords,
  Syringe,
  // T
  Table, Table2, Tablet, Tag, Tags, Target, Tent, Terminal, TerminalSquare, TestTube,
  TestTube2, TestTubes, Text, TextCursor, TextCursorInput, TextQuote, TextSelect, Thermometer, ThermometerSnowflake, ThermometerSun,
  ThumbsDown, ThumbsUp, Ticket, Timer, TimerOff, TimerReset, ToggleLeft, ToggleRight, Tornado, TrafficCone,
  Train, Trash, Trash2, TreeDeciduous, TreePine, Trees, TrendingDown, TrendingUp, Triangle, Trophy,
  Truck, Tv, Tv2, Twitch, Twitter, Type,
  // U-Z
  Umbrella, Underline, Undo, Undo2, Unlink, Unlink2, Unlock, Upload, UploadCloud, Usb,
  User, UserCheck, UserCog, UserMinus, UserPlus, UserX, Users, UtensilsCrossed, Variable,
  Vegan, VenetianMask, Verified, Vibrate, VibrateOff, Video, VideoOff, View, Voicemail, Volume,
  Volume1, Volume2, VolumeX, Vote, Wallet, Wallet2, Wand, Wand2, Warehouse, Watch,
  Waves, Webcam, Webhook, Wheat, WheatOff, Wifi, WifiOff, Wind, Wine,
  Wrench, X, XCircle, XOctagon, XSquare, Youtube, Zap, ZapOff, ZoomIn, ZoomOut
} from 'lucide-react';

// Pre-built list of icons with their components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  // A
  Activity, Airplay, AlarmClock, AlertCircle, AlertOctagon, AlertTriangle, AlignCenter, AlignJustify, AlignLeft, AlignRight,
  Anchor, Aperture, Archive, ArrowBigDown, ArrowBigLeft, ArrowBigRight, ArrowBigUp, ArrowDown, ArrowDownCircle, ArrowDownLeft,
  ArrowDownRight, ArrowLeft, ArrowLeftCircle, ArrowRight, ArrowRightCircle, ArrowUp, ArrowUpCircle, ArrowUpDown, ArrowUpLeft,
  ArrowUpRight, AtSign, Award,
  // B
  Baby, BadgeCheck, BadgeDollarSign, BadgePercent, Ban, Banknote, BarChart, BarChart2, BarChart3, Battery,
  BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Beaker, Bell, BellOff, BellRing, Bike, Binary,
  Bitcoin, Blend, Blocks, Bluetooth, Bold, Bomb, Bone, Book, BookOpen, Bookmark,
  Bot, Box, Boxes, Brain, Briefcase, Brush, Bug, Building, Building2, Bus,
  // C
  Cake, Calculator, Calendar, Camera, CameraOff, Car, Castle, Cat, CheckCheck, Check,
  CheckCircle, CheckCircle2, CheckSquare, ChevronDown, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, ChevronUp, ChevronsDown,
  ChevronsLeft, ChevronsRight, ChevronsUp, Chrome, Circle, CircleDot, CircleOff, Clapperboard, Clipboard, ClipboardCheck,
  ClipboardCopy, ClipboardList, Clock, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudOff, CloudRain, CloudSnow,
  CloudSun, Clover, Code, Code2, Codepen, Codesandbox, Coffee, Cog, Coins, Columns,
  Command: CommandIcon, Compass, Component, Contrast, Cookie, Copy, CopyCheck, Copyright, CornerDownLeft, CornerDownRight,
  CornerLeftDown, CornerLeftUp, CornerRightDown, CornerRightUp, CornerUpLeft, CornerUpRight, Cpu, CreditCard, Croissant, Crop,
  Crown, CupSoda,
  // D
  Database, Delete, Diamond, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Dices,
  Disc, Divide, DivideCircle, DivideSquare, Dog, DollarSign, Donut, DoorClosed, DoorOpen, Download,
  DownloadCloud, Dribbble, Droplet, Droplets, Drum, Drumstick, Dumbbell,
  // E
  Ear, EarOff, Edit, Edit2, Edit3, Egg, Equal, EqualNot, Eraser, Euro,
  Expand, ExternalLink, Eye, EyeOff,
  // F
  Facebook, Factory, Fan, FastForward, Feather, Figma, File, FileArchive, FileAudio, FileAxis3d,
  FileBarChart, FileBox, FileCheck, FileCode, FileCog, FileDiff, FileDigit, FileDown, FileEdit, FileHeart,
  FileImage, FileInput, FileJson, FileKey, FileLock, FileMinus, FileOutput, FilePlus, FileQuestion, FileScan,
  FileSearch, FileSpreadsheet, FileSymlink, FileTerminal, FileText, FileType, FileUp, FileVideo, FileVolume, FileWarning,
  FileX, Files, Film, Filter, Fingerprint, Flag, FlagOff, Flame, Flashlight,
  FlaskConical, FlaskRound, FlipHorizontal, FlipVertical, Flower, Flower2, Focus, Folder, FolderArchive, FolderCheck,
  FolderClock, FolderCog, FolderDown, FolderEdit, FolderHeart, FolderInput, FolderKey, FolderLock, FolderMinus, FolderOpen,
  FolderOutput, FolderPlus, FolderSearch, FolderSymlink, FolderTree, FolderUp, FolderX, Folders, Footprints, Forklift,
  FormInput, Forward, Frame, Framer, Frown,
  // G
  Gamepad, Gamepad2, Gauge, Gavel, Gem, Ghost, Gift, GitBranch, GitCommit, GitCompare,
  GitFork, GitMerge, GitPullRequest, Github, Gitlab, GlassWater, Glasses, Globe, Globe2, Goal,
  Grab, GraduationCap, Grape, Grid,
  // H
  Hammer, Hand, HandMetal, HardDrive, HardHat, Hash, Haze, Heading, Heading1, Heading2,
  Heading3, Heading4, Heading5, Heading6, Headphones, Heart, HeartCrack, HeartHandshake, HeartOff, HeartPulse,
  HelpCircle, Hexagon, Highlighter, History, Home, Hotel, Hourglass,
  // I-L
  IceCream, Image, ImageMinus, ImageOff, ImagePlus, Import, Inbox, Indent, IndianRupee, Infinity,
  Info, Inspect, Instagram, Italic, JapaneseYen, Joystick, Key, Keyboard, Lamp, LampCeiling,
  LampDesk, LampFloor, LampWallDown, LampWallUp, Landmark, Languages, Laptop, Laptop2, Lasso, LassoSelect,
  Laugh, Layers, Layout, LayoutDashboard, LayoutGrid, LayoutList, LayoutTemplate, Leaf, LeafyGreen, Library,
  LifeBuoy, Lightbulb, LightbulbOff, LineChart, Link, Link2, Link2Off, Linkedin, List, ListChecks,
  ListEnd, ListMinus, ListMusic, ListOrdered, ListPlus, ListStart, ListTree, ListVideo, ListX, Loader,
  Loader2, Locate, LocateFixed, LocateOff, Lock, LogIn, LogOut,
  // M
  Magnet, Mail, MailCheck, MailMinus, MailOpen, MailPlus, MailQuestion, MailSearch, MailWarning, MailX,
  Mailbox, Map, MapPin, MapPinOff, Maximize, Maximize2, Medal, Megaphone, Meh, Menu,
  MessageCircle, MessageSquare, Mic, Mic2, MicOff, Microscope, Microwave, Milestone, Milk, Minimize,
  Minimize2, Minus, MinusCircle, MinusSquare, Monitor, MonitorOff, MonitorSpeaker, Moon, MoreHorizontal, MoreVertical,
  Mountain, MountainSnow, Mouse, MousePointer, MousePointer2, MousePointerClick, Move, Move3d, MoveDown, MoveDownLeft,
  MoveDownRight, MoveHorizontal, MoveLeft, MoveRight, MoveUp, MoveUpLeft, MoveUpRight, MoveVertical, Music, Music2,
  Music3, Music4,
  // N-P
  Navigation, Navigation2, Network, Newspaper, Nut, Octagon, Option, Orbit, Outdent, Package,
  Package2, PackageCheck, PackageMinus, PackageOpen, PackagePlus, PackageSearch, PackageX, PaintBucket, Paintbrush, Paintbrush2,
  Palette, Palmtree, PanelBottom, PanelLeft, PanelRight, PanelTop, Paperclip, Parentheses, ParkingCircle, ParkingCircleOff,
  ParkingSquare, ParkingSquareOff, PartyPopper, Pause, PauseCircle, PauseOctagon, PenTool, Pencil, Pentagon, Percent,
  PersonStanding, Phone, PhoneCall, PhoneForwarded, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Pi, PieChart,
  PiggyBank, Pin, PinOff, Pipette, Pizza, Plane, Play, PlayCircle, Plug, Plug2,
  PlugZap, Plus, PlusCircle, PlusSquare, Pocket, Podcast, Pointer, PoundSterling, Power, PowerOff,
  Presentation, Printer, Puzzle,
  // Q-R
  QrCode, Quote, Radar, Radiation, Radio, RadioReceiver, RectangleHorizontal, RectangleVertical, Recycle, Redo,
  Redo2, RefreshCcw, RefreshCw, Refrigerator, Regex, RemoveFormatting, Repeat, Repeat1, Reply, ReplyAll,
  Rewind, Rocket, RockingChair, RotateCcw, RotateCw, Router, Rows, Rss, Ruler, RussianRuble,
  // S
  Sailboat, Save, Scale, Scale3d, Scaling, Scan, ScanFace, ScanLine, Scissors, ScreenShare,
  ScreenShareOff, Scroll, ScrollText, Search: SearchIconBase, SearchCheck, SearchCode, SearchSlash, SearchX, Send, SendHorizontal,
  SendToBack, SeparatorHorizontal, SeparatorVertical, Server, ServerCog, ServerCrash, ServerOff, Settings, Settings2, Share,
  Share2, Sheet, Shield, ShieldAlert, ShieldCheck, ShieldClose, ShieldOff, ShieldQuestion, Ship, Shirt,
  ShoppingBag, ShoppingCart, Shovel, ShowerHead, Shrink, Shrub, Shuffle, Sigma, Signal, SignalHigh,
  SignalLow, SignalMedium, SignalZero, Siren, SkipBack, SkipForward, Skull, Slack, Slash, Slice,
  Sliders, SlidersHorizontal, Smartphone, SmartphoneCharging, Smile, SmilePlus, Snail, Snowflake, Sofa, SortAsc,
  SortDesc, Soup, Space, Sparkle, Sparkles, Speaker, Spline, Split, SplitSquareHorizontal, SplitSquareVertical,
  Sprout, Square, SquareAsterisk, Squirrel, Stamp, Star, StarHalf, StarOff, StepBack, StepForward,
  Stethoscope, Sticker, StickyNote, StopCircle, Store, StretchHorizontal, StretchVertical, Strikethrough, Subscript, Sun,
  SunDim, SunMedium, SunSnow, Sunrise, Sunset, Superscript, SwissFranc, SwitchCamera, Sword, Swords,
  Syringe,
  // T
  Table, Table2, Tablet, Tag, Tags, Target, Tent, Terminal, TerminalSquare, TestTube,
  TestTube2, TestTubes, Text, TextCursor, TextCursorInput, TextQuote, TextSelect, Thermometer, ThermometerSnowflake, ThermometerSun,
  ThumbsDown, ThumbsUp, Ticket, Timer, TimerOff, TimerReset, ToggleLeft, ToggleRight, Tornado, TrafficCone,
  Train, Trash, Trash2, TreeDeciduous, TreePine, Trees, TrendingDown, TrendingUp, Triangle, Trophy,
  Truck, Tv, Tv2, Twitch, Twitter, Type,
  // U-Z
  Umbrella, Underline, Undo, Undo2, Unlink, Unlink2, Unlock, Upload, UploadCloud, Usb,
  User, UserCheck, UserCog, UserMinus, UserPlus, UserX, Users, UtensilsCrossed, Variable,
  Vegan, VenetianMask, Verified, Vibrate, VibrateOff, Video, VideoOff, View, Voicemail, Volume,
  Volume1, Volume2, VolumeX, Vote, Wallet, Wallet2, Wand, Wand2, Warehouse, Watch,
  Waves, Webcam, Webhook, Wheat, WheatOff, Wifi, WifiOff, Wind, Wine,
  Wrench, X: XIcon, XCircle, XOctagon, XSquare, Youtube, Zap, ZapOff, ZoomIn, ZoomOut
};

// Pre-built list for display
const iconList = Object.entries(ICON_MAP).map(([name, icon]) => ({ name, icon }));

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const IconPicker: React.FC<IconPickerProps> = ({
  value,
  onChange,
  className
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Filter icons based on search
  const filteredIcons = useMemo(() => {
    if (!search) return iconList;
    const lower = search.toLowerCase();
    return iconList.filter(item => item.name.toLowerCase().includes(lower));
  }, [search]);

  const SelectedIcon = value ? ICON_MAP[value] : null;

  // Handle clear
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <div className="flex items-center gap-2 truncate">
            {SelectedIcon ? <SelectedIcon className="h-4 w-4" /> : <Search className="h-4 w-4 opacity-50" />}
            <span className="truncate">{value || "Select icon..."}</span>
          </div>
          <div className="flex items-center gap-1">
            {value && (
              <XIcon
                className="h-3 w-3 opacity-50 hover:opacity-100 cursor-pointer"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search icons..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[350px] overflow-auto">
            <CommandGroup heading={`Icons (${filteredIcons.length})`}>
              {filteredIcons.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No icon found.</div>
              ) : (
                <div className="grid grid-cols-6 gap-1 p-2">
                  {filteredIcons.map(({ name, icon: IconComponent }) => (
                    <div
                      key={name}
                      className={cn(
                        "flex flex-col items-center justify-center p-2 rounded-md cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors aspect-square",
                        value === name ? "bg-accent text-accent-foreground ring-2 ring-primary" : ""
                      )}
                      onClick={() => {
                        onChange(name);
                        setOpen(false);
                      }}
                      title={name}
                    >
                      <IconComponent className="h-5 w-5" />
                    </div>
                  ))}
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

// Export the icon map for use by other components
export { ICON_MAP };
