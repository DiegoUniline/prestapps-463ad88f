import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function CalendarCaption({
  displayMonth,
  onMonthChange,
}: {
  displayMonth: Date;
  onMonthChange: (date: Date) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];

  return (
    <div className="flex items-center justify-center gap-1">
      <Select
        value={String(displayMonth.getMonth())}
        onValueChange={(v) => {
          const newDate = new Date(displayMonth);
          newDate.setMonth(parseInt(v));
          onMonthChange(newDate);
        }}
      >
        <SelectTrigger className="h-7 text-xs font-medium border-none shadow-none px-2 gap-1 w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((m, i) => (
            <SelectItem key={i} value={String(i)} className="text-xs">{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={String(displayMonth.getFullYear())}
        onValueChange={(v) => {
          const newDate = new Date(displayMonth);
          newDate.setFullYear(parseInt(v));
          onMonthChange(newDate);
        }}
      >
        <SelectTrigger className="h-7 text-xs font-medium border-none shadow-none px-2 gap-1 w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-48">
          {years.map((y) => (
            <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const [month, setMonth] = React.useState<Date>(
    (props as any).selected instanceof Date ? (props as any).selected : new Date()
  );

  return (
    <DayPicker
      month={month}
      onMonthChange={setMonth}
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex justify-center pt-1 relative items-center",
        caption_label: "hidden",
        nav: "space-x-1 flex items-center",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex",
        head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
        row: "flex w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
        day_range_end: "day-range-end",
        day_selected:
          "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
        day_today: "bg-accent text-accent-foreground",
        day_outside:
          "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
        day_disabled: "text-muted-foreground opacity-50",
        day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        Caption: ({ displayMonth }) => (
          <CalendarCaption displayMonth={displayMonth} onMonthChange={setMonth} />
        ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
