import { Check } from "lucide-react"

import { AvatarIcon } from "../UI/AvatarIcon";
import { AVATAR_PRESETS } from "@/lib/avatarPresets";

type Props = {
	value: number
}

export function AvatarPicker({ value }: Props) {
	return (
		<div className="grid grid-cols-4 gap-2.5">
			{AVATAR_PRESETS.map((preset, i) => {
				const selected = value === i;
				return (
					<div
						key={i}
						className={`relative flex flex-col items-center gap-1.5 border-2 p-2.5 transition-all ${
							selected 
								? "border-current bg-white/5"
								: "border-white/10"
						}`}
						style={selected ? { color: preset.color, boxShadow: `0 0 18px ${preset.color}35`}: undefined}
					>
						<AvatarIcon color={preset.color} symbol={preset.symbol} size={32} />
						<div
							className="h-0.5 w-full"
							style={{backgroundColor: preset.color, boxShadow: `0 0 5px ${preset.color}`}}
						/>
						{selected && (
							<Check size={10} className="absolute right-1 top-1" style={{ color: preset.color }} />
						)}
					</div>
				)
			})}
		</div>
	)
}