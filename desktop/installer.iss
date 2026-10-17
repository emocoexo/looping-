#ifndef AppVersion
  #define AppVersion "2.0.1"
#endif
[Setup]
AppId={{907DD061-EDC0-471F-8749-4CB3BE5B4B2D}
AppName=Loop Studio
AppVersion={#AppVersion}
AppPublisher=emocoexo
AppPublisherURL=https://github.com/emocoexo/looping-
DefaultDirName={localappdata}\Programs\Loop Studio
DefaultGroupName=Loop Studio
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist
OutputBaseFilename=Loop-Studio-Setup-{#AppVersion}-win-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\Loop Studio.exe
CloseApplications=yes

[Files]
Source: "..\.build\windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Buat shortcut Loop Studio di Desktop"; Flags: checkedonce

[Icons]
Name: "{group}\Loop Studio"; Filename: "{app}\Loop Studio.exe"
Name: "{autodesktop}\Loop Studio"; Filename: "{app}\Loop Studio.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Loop Studio.exe"; Description: "Buka Loop Studio"; Flags: nowait postinstall skipifsilent
